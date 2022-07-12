import { ByteBuffer, logger } from '@runejs/common';
import { Bzip2, getCompressionMethod, Gzip } from '@runejs/common/compress';
import { Xtea, XteaKeys } from '@runejs/common/encrypt';
import { Group } from './group';
import { Archive } from './archive';
import { FileStore } from './file-store';
import { ArchiveFormat } from '../config';
import { archiveFlags } from '../config/archive-flags';
import { FlatFile } from './flat-file';


export class JS5 {

    readonly fileStore: FileStore;

    private mainIndex: ByteBuffer;
    private archiveIndexes: Map<string, ByteBuffer>;
    private mainArchiveData: ByteBuffer;

    constructor(fileStore: FileStore) {
        this.fileStore = fileStore;
    }

    unpack(file: Group | Archive): Buffer | null {
        const fileDetails = file.index;
        const fileKey = fileDetails.key;
        const archiveKey: number = file instanceof Archive ? 255 : file.archive.index.key;
        const archiveName: string = file instanceof Archive ? 'main' : file.archive.index.name;

        const indexChannel: ByteBuffer = archiveKey !== 255 ?
            this.archiveIndexes.get(String(archiveKey)) : this.mainIndex;

        if (archiveKey === 255 && fileKey === 255) {
            return null;
        }

        const indexDataLength = 6;
        const dataChannel = this.mainArchiveData;

        indexChannel.readerIndex = 0;
        dataChannel.readerIndex = 0;

        let pointer = fileKey * indexDataLength;

        if (pointer < 0 || pointer >= indexChannel.length) {
            logger.error(`File ${fileKey} was not found within the ${archiveName} archive index file.`);
            return null;
        }

        const fileIndexData = new ByteBuffer(indexDataLength);
        indexChannel.copy(fileIndexData, 0, pointer, pointer + indexDataLength);

        if (fileIndexData.readable !== indexDataLength) {
            logger.error(`Error extracting JS5 file ${fileKey}: the end of the data stream was reached.`);
            return null;
        }

        fileDetails.fileSize = fileIndexData.get('int24', 'unsigned');
        fileDetails.stripeCount = fileIndexData.get('int24', 'unsigned');

        if (fileDetails.fileSize <= 0) {
            logger.warn(`Extracted JS5 file ${fileKey} has a recorded size of 0, no file data will be extracted.`);
            return null;
        }

        const data = new ByteBuffer(fileDetails.fileSize);
        const stripeDataLength = 512;
        const stripeLength = 520;

        let stripe = 0;
        let remaining = fileDetails.fileSize;
        pointer = fileDetails.stripeCount * stripeLength;

        do {
            const temp = new ByteBuffer(stripeLength);
            dataChannel.copy(temp, 0, pointer, pointer + stripeLength);

            if(temp.readable !== stripeLength) {
                logger.error(`Error reading stripe for packed file ${fileKey}, the end of the data stream was reached.`);
                return null;
            }

            const stripeFileIndex = temp.get('short', 'unsigned');
            const currentStripe = temp.get('short', 'unsigned');
            const nextStripe = temp.get('int24', 'unsigned');
            const stripeArchiveIndex = temp.get('byte', 'unsigned');
            const stripeData = new ByteBuffer(stripeDataLength);
            temp.copy(stripeData, 0, temp.readerIndex, temp.readerIndex + stripeDataLength);

            if(remaining > stripeDataLength) {
                stripeData.copy(data, data.writerIndex, 0, stripeDataLength);
                data.writerIndex = (data.writerIndex + stripeDataLength);
                remaining -= stripeDataLength;

                if(stripeArchiveIndex !== archiveKey) {
                    logger.error(`Archive index mismatch, expected archive ${archiveKey} but found archive ${stripeFileIndex}`);
                    return null;
                }

                if(stripeFileIndex !== fileKey) {
                    logger.error(`File index mismatch, expected ${fileKey} but found ${stripeFileIndex}.`);
                    return null;
                }

                if(currentStripe !== stripe++) {
                    logger.error(`Error extracting JS5 file ${fileKey}, file data is corrupted.`);
                    return null;
                }

                pointer = nextStripe * stripeLength;
            } else {
                stripeData.copy(data, data.writerIndex, 0, remaining);
                data.writerIndex = (data.writerIndex + remaining);
                remaining = 0;
            }
        } while (remaining > 0);

        if (data?.length) {
            fileDetails.compressedData = data.toNodeBuffer();
        } else {
            fileDetails.compressedData = null;
            fileDetails.fileError = 'FILE_MISSING';
        }

        return fileDetails.compressedData;
    }

    readCompressedFileHeader(file: Group | Archive): {
        compressedLength: number;
        readerIndex: number;
    } {
        const fileDetails = file.index;

        if (!fileDetails.compressedData?.length) {
            return { compressedLength: 0, readerIndex: 0 };
        }

        const compressedData = new ByteBuffer(fileDetails.compressedData);

        fileDetails.compressionMethod = getCompressionMethod(
            compressedData.get('byte', 'unsigned'));

        const compressedLength = compressedData.get('int', 'unsigned');
        const readerIndex = compressedData.readerIndex;

        return { compressedLength, readerIndex };
    }

    decrypt(file: Group | Archive): Buffer {
        const fileDetails = file.index;
        const fileName = fileDetails.name;

        if (!fileDetails.compressedData?.length) {
            logger.error(`Error decrypting file ${fileName || fileDetails.key}, file data not found.`,
                `Please ensure that the file has been unpacked from an existing JS5 file store using JS5.unpack(file);`);
            return null;
        }

        if (!fileDetails.encrypted) {
            return fileDetails.compressedData;
        }

        // @todo move to JS5.decodeArchive
        // const archiveName = file instanceof Archive ? 'main' : file.archive.index.name;
        // const archiveConfig = this.fileStore.archiveConfig[archiveName];
        //
        // if (archiveConfig.encryption) {
        //     const [ encryption, pattern ] = archiveConfig.encryption;
        //     const patternRegex = new RegExp(pattern);
        //
        //     // Only XTEA encryption is supported at this time
        //     if(encryption !== 'xtea' || !patternRegex.test(fileName)) {
        //         // FileBase name does not match the pattern, data should be unencrypted
        //         return fileDetails.compressedData;
        //     }
        // } else {
        //     return fileDetails.compressedData;
        // }

        const gameBuild = this.fileStore.gameBuild;
        let keySets: XteaKeys[] = [];

        const loadedKeys = this.getEncryptionKeys(fileName);
        if (loadedKeys) {
            if(!Array.isArray(loadedKeys)) {
                keySets = [ loadedKeys ];
            } else {
                keySets = loadedKeys;
            }
        }

        const { compressedLength, readerIndex } = this.readCompressedFileHeader(file);
        const encryptedData = new ByteBuffer(fileDetails.compressedData);
        const keySet = keySets.find(keySet => keySet.gameBuild === gameBuild);

        if (Xtea.validKeys(keySet?.key)) {
            const dataCopy = encryptedData.clone();
            dataCopy.readerIndex = readerIndex;

            let lengthOffset = readerIndex;
            if(dataCopy.length - (compressedLength + readerIndex + 4) >= 2) {
                lengthOffset += 2;
            }

            const decryptedData = Xtea.decrypt(dataCopy, keySet.key, dataCopy.length - lengthOffset);

            if (decryptedData?.length) {
                decryptedData.copy(dataCopy, readerIndex, 0);
                dataCopy.readerIndex = readerIndex;
                fileDetails.compressedData = dataCopy.toNodeBuffer();
                fileDetails.encrypted = false;
            } else {
                logger.warn(`Invalid XTEA decryption keys found for file ` +
                    `${fileName || fileDetails.key} using game build ${ gameBuild }.`);
                fileDetails.fileError = 'MISSING_ENCRYPTION_KEYS';
            }
        } else {
            logger.warn(`No XTEA decryption keys found for file ` +
                `${fileName || fileDetails.key} using game build ${gameBuild}.`);
            fileDetails.fileError = 'MISSING_ENCRYPTION_KEYS';
        }

        return fileDetails.compressedData;
    }

    decompress(file: Group | Archive): Buffer | null {
        const fileDetails = file.index;

        if (!fileDetails.compressedData?.length) {
            return null;
        }

        if (fileDetails.encrypted && !this.decrypt(file)) {
            return null;
        }

        const { compressedLength, readerIndex } = this.readCompressedFileHeader(file);

        // JS5.decrypt will set compressedData to the new decrypted data after completion
        const compressedData = new ByteBuffer(fileDetails.compressedData);
        compressedData.readerIndex = readerIndex;
        let data: ByteBuffer;

        if (fileDetails.compressionMethod === 'none') {
            // Uncompressed file
            data = new ByteBuffer(compressedLength);
            compressedData.copy(data, 0, compressedData.readerIndex, compressedLength);
            compressedData.readerIndex = (compressedData.readerIndex + compressedLength);
        } else {
            // BZIP or GZIP compressed file
            const decompressedLength = compressedData.get('int', 'unsigned');
            if (decompressedLength < 0) {
                const errorPrefix = `Unable to decompress file ${fileDetails.name || fileDetails.key}:`;
                if (fileDetails.fileError === 'FILE_MISSING') {
                    logger.error(`${errorPrefix} Missing file data.`);
                } else {
                    logger.error(`${errorPrefix} Missing or invalid XTEA key.`);
                    fileDetails.fileError = 'MISSING_ENCRYPTION_KEYS';
                }
            } else {
                const decompressedData = new ByteBuffer(fileDetails.compressionMethod === 'bzip' ?
                    decompressedLength : (compressedData.length - compressedData.readerIndex + 2));

                compressedData.copy(decompressedData, 0, compressedData.readerIndex);

                try {
                    data = fileDetails.compressionMethod === 'bzip' ?
                        Bzip2.decompress(decompressedData) : Gzip.decompress(decompressedData);

                    compressedData.readerIndex = compressedData.readerIndex + compressedLength;

                    if (data.length !== decompressedLength) {
                        logger.error(`Compression length mismatch.`);
                        data = null;
                    }
                } catch (error) {
                    logger.error(`Error decompressing file ${fileDetails.name || fileDetails.key}:`,
                        error?.message ?? error);
                    data = null;
                }
            }
        }

        // Read the file footer, if it has one
        if(compressedData.readable >= 2) {
            fileDetails.version = compressedData.get('short', 'unsigned');
        }

        if (data?.length) {
            fileDetails.data = data?.toNodeBuffer();
        }

        return fileDetails.data;
    }

    async decodeArchive(archive: Archive): Promise<void> {
        const archiveDetails = archive.index;

        if (archiveDetails.key === 255) {
            return;
        }

        const archiveName = archiveDetails.name;

        logger.info(`Decoding archive ${archiveName}...`);

        if (!archiveDetails.data) {
            this.decompress(archive);

            if (!archiveDetails.data) {
                logger.error(`Unable to decode archive ${archiveName}.`);
                return;
            }
        }

        // logger.info(`Archive ${archiveName} checksum: ${this.crc32}`);

        const archiveData = new ByteBuffer(archiveDetails.data);
        const format = archiveDetails.archiveFormat = archiveData.get('byte', 'unsigned');
        const mainDataType = format >= ArchiveFormat.smart ? 'smart_int' : 'short';
        archiveDetails.version = format >= ArchiveFormat.versioned ? archiveData.get('int') : 0;
        const flags = archiveFlags(archiveData.get('byte', 'unsigned'));
        const groupCount = archiveData.get(mainDataType, 'unsigned');
        const groups: Group[] = new Array(groupCount);
        let missingEncryptionKeys = 0;
        let accumulator = 0;

        logger.info(`${groupCount} groups were found within the ${archiveName} archive.`);

        // Group index keys
        for (let i = 0; i < groupCount; i++) {
            const delta = archiveData.get(mainDataType, 'unsigned');
            const groupKey = accumulator += delta;
            const group = groups[i] = new Group(this.fileStore, groupKey, archive);
            archive.setChild(groupKey, group);
        }

        // Load group database indexes, or create them if they don't yet exist
        // @todo batch load all archive groups at once
        for (const group of groups) {
            await group.loadIndex();
        }

        // Group name hashes
        if (flags.groupNames) {
            for (const group of groups) {
                group.index.nameHash = archiveData.get('int');
                group.index.name = this.fileStore.findFileName(
                    group.index.nameHash,
                    group.index.name || String(group.index.nameHash) || String(group.index.key)
                );
            }
        }

        // Compressed file data CRC32 checksums
        for (const group of groups) {
            group.index.compressedChecksum = archiveData.get('int');
        }

        // Decompressed file data CRC32 checksums
        if (flags.decompressedCrcs) {
            for (const group of groups) {
                group.index.checksum = archiveData.get('int');
            }
        }

        // File data whirlpool digests
        if (flags.whirlpoolDigests) {
            for (const group of groups) {
                group.index.whirlpoolDigest = Buffer.alloc(512);
                archiveData.getBytes(group.index.whirlpoolDigest, 512);
            }
        }

        // Group file sizes
        if (flags.groupSizes) {
            for (const group of groups) {
                group.index.compressedFileSize = archiveData.get('int');
                group.index.fileSize = archiveData.get('int');
            }
        }

        // Group version numbers
        for (const group of groups) {
            group.index.version = archiveData.get('int');
        }

        // Group child file counts
        for (let i = 0; i < groupCount; i++) {
            groups[i].index.childCount = archiveData.get('short', 'unsigned');
        }

        // Grouped file index keys
        for (const group of groups) {
            const fileCount = group.index.childCount || 0;
            accumulator = 0;

            for (let i = 0; i < fileCount; i++) {
                const delta = archiveData.get(mainDataType, 'unsigned');
                const childFileIndex = accumulator += delta;
                const flatFile = new FlatFile(this.fileStore, childFileIndex, group);
                group.setChild(childFileIndex, flatFile);
            }
        }

        // Load flat file database indexes, or create them if they don't yet exist
        // @todo batch load all grouped files at once
        for (const group of groups) {
            for (const [ , flatFile ] of group.children) {
                await flatFile.loadIndex();
            }
        }

        // Grouped file names
        if (flags.groupNames) {
            for (const group of groups) {
                for (const [ , flatFile ] of group.children) {
                    flatFile.index.nameHash = archiveData.get('int');
                    flatFile.index.name = this.fileStore.findFileName(
                        flatFile.index.nameHash,
                        flatFile.index.name || String(flatFile.index.nameHash) || String(flatFile.index.key)
                    );
                }
            }
        }
    }

    async decodeGroup(group: Group): Promise<void> {
        const groupDetails = group.index;
        const { key: groupKey, name: groupName } = groupDetails;
        const files = group.children;

        if (!groupDetails.data) {
            this.decompress(group);

            if (!groupDetails.data) {
                logger.error(`Unable to decode group ${groupName || groupKey}.`);
                return;
            }
        }

        const data = new ByteBuffer(groupDetails.data);

        if(groupDetails.childCount === 1) {
            return;
        }

        data.readerIndex = (data.length - 1); // EOF - 1 byte

        groupDetails.stripeCount = data.get('byte', 'unsigned');

        data.readerIndex = (data.length - 1 - groupDetails.stripeCount *
            groupDetails.childCount * 4); // Stripe data footer

        if (data.readerIndex < 0) {
            logger.error(`Invalid reader index of ${data.readerIndex} for group ` +
                `${groupName || groupKey}.`);
            return;
        }

        const fileSizeMap = new Map<string, number>();
        const fileStripeMap = new Map<string, number[]>();
        const fileDataMap = new Map<string, ByteBuffer>();

        for (const [ flatFileKey, ] of files) {
            fileSizeMap.set(flatFileKey, 0);
            fileStripeMap.set(flatFileKey, new Array(groupDetails.stripeCount));
        }

        for (let stripe = 0; stripe < groupDetails.stripeCount; stripe++) {
            let currentLength = 0;

            for (const [ flatFileKey, ] of files) {
                const delta = data.get('int');
                currentLength += delta;

                const fileStripes = fileStripeMap.get(flatFileKey);
                const size = fileSizeMap.get(flatFileKey) + currentLength;

                fileStripes[stripe] = currentLength;
                fileSizeMap.set(flatFileKey, size + currentLength);
            }
        }

        for (const [ flatFileKey, file ] of files) {
            file.index.fileSize = fileSizeMap.get(flatFileKey);
            file.index.stripeCount = groupDetails.stripeCount;
            file.index.stripes = fileStripeMap.get(flatFileKey).join(',');
            fileDataMap.set(flatFileKey, new ByteBuffer(file.index.fileSize));
        }

        data.readerIndex = 0;

        for (let stripe = 0; stripe < groupDetails.stripeCount; stripe++) {
            for (const [ fileIndex, ] of files) {
                let stripeLength = fileStripeMap.get(fileIndex)[stripe];
                let sourceEnd: number = data.readerIndex + stripeLength;

                if (data.readerIndex + stripeLength >= data.length) {
                    sourceEnd = data.length;
                    stripeLength = (data.readerIndex + stripeLength) - data.length;
                }

                const stripeData = data.getSlice(data.readerIndex, stripeLength);
                const fileData = fileDataMap.get(fileIndex);

                fileData.putBytes(stripeData);

                data.readerIndex = sourceEnd;
            }
        }

        for (const [ fileIndex, file ] of files) {
            file.index.data = fileDataMap.get(fileIndex).toNodeBuffer();
        }
    }

    pack(file: Group | Archive): Buffer | null {
        return null; // @todo stub
    }

    encrypt(file: Group | Archive): Buffer | null {
        return null; // @todo stub
    }

    compress(file: Group | Archive): Buffer | null {
        const fileDetails = file.index;

        if (!fileDetails.data?.length) {
            return null;
        }

        const decompressedData = new ByteBuffer(fileDetails.data);
        let data: ByteBuffer;

        if (fileDetails.compressionMethod === 'none') {
            // uncompressed files
            data = new ByteBuffer(decompressedData.length + 5);

            // indicate that no file compression is applied
            data.put(0);

            // write the uncompressed file length
            data.put(decompressedData.length, 'int');

            // write the uncompressed file data
            data.putBytes(decompressedData);
        } else {
            // compressed Bzip2 or Gzip file

            const compressedData: ByteBuffer = fileDetails.compressionMethod === 'bzip' ?
                Bzip2.compress(decompressedData) : Gzip.compress(decompressedData);

            const compressedLength: number = compressedData.length;

            data = new ByteBuffer(compressedData.length + 9);

            // indicate which type of file compression was used (1 or 2)
            data.put(fileDetails.compressionMethod === 'bzip' ? 1 : 2);

            // write the compressed file length
            data.put(compressedLength, 'int');

            // write the uncompressed file length
            data.put(decompressedData.length, 'int');

            // write the compressed file data
            data.putBytes(compressedData);
        }

        if (data?.length) {
            fileDetails.compressedData = data.toNodeBuffer();
        }

        return fileDetails.compressedData;
    }

    encodeArchive(archive: Archive): Buffer {
        return null; // @todo stub
    }

    encodeGroup(group: Group): Buffer {
        return null; // @todo stub
    }

    getEncryptionKeys(fileName: string): any[] {
        return []; // @todo stub
    }

}
