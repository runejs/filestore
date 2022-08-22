import { join } from 'path';
import { Buffer } from 'buffer';
import { existsSync, readdirSync, readFileSync, statSync } from 'graceful-fs';

import { ByteBuffer, logger } from '@runejs/common';
import { getCompressionMethod } from '@runejs/common/compress';
import { Xtea, XteaKeys, XteaConfig } from '@runejs/common/encrypt';

import { Js5FileStore, Js5Archive, Js5Group, Js5File } from '.';
import { archiveFlags, ArchiveFormat } from '../../config';
import { getXteaKeysByBuild } from '../../openrs2';
import {
    compressHeadlessBzip2,
    decompressHeadlessBzip2,
    compressGzip,
    decompressGzip
} from '../../compress';
import { PackedCacheFile } from '../packed';


const dataFileName = 'main_file_cache.dat2';
const indexFileNamePrefix = 'main_file_cache.idx';
const mainIndexFileName = `${ indexFileNamePrefix }255`;


export class JS5 {

    readonly fileStore: Js5FileStore;

    localEncryptionKeys: Map<string, XteaKeys[]>;
    openRS2EncryptionKeys: XteaConfig[];

    private mainIndexFile: ByteBuffer;
    private indexFiles: Map<number, ByteBuffer>;
    private dataFile: ByteBuffer;

    constructor(fileStore: Js5FileStore) {
        this.fileStore = fileStore;
        this.indexFiles = new Map<number, ByteBuffer>();
    }

    readOpenRS2CacheFiles(cacheFiles: PackedCacheFile[]): void {
        const dataFileBuffer = cacheFiles.find(file => file.name === dataFileName)?.data || null;
        if (!dataFileBuffer?.length) {
            throw new Error(`The main ${ dataFileName } data file could not be found.`);
        }

        const mainIndexFileBuffer = cacheFiles.find(file => file.name === mainIndexFileName)?.data || null;
        if (!mainIndexFileBuffer?.length) {
            throw new Error(`The main ${ mainIndexFileName } index file could not be found.`);
        }

        this.dataFile = new ByteBuffer(dataFileBuffer);
        this.mainIndexFile = new ByteBuffer(mainIndexFileBuffer);
        this.indexFiles.clear();

        for (const cacheFile of cacheFiles) {
            const fileName = cacheFile?.name;

            if (!fileName?.length || fileName === mainIndexFileName || fileName === dataFileName) {
                continue;
            }

            if (!fileName.startsWith(indexFileNamePrefix)) {
                continue;
            }

            if (!cacheFile?.data?.length) {
                logger.error(`Index file ${ fileName } is empty!`);
                continue;
            }

            const indexString = fileName.substring(fileName.indexOf('.idx') + 4);
            const archiveKey = Number(indexString);

            if (isNaN(archiveKey)) {
                logger.error(`Index file ${ fileName } does not have a valid extension.`);
            }

            this.indexFiles.set(archiveKey, new ByteBuffer(cacheFile.data));
            this.fileStore.createArchive(archiveKey);
        }

        logger.info(`JS5 store file loaded for game build ${ this.fileStore.gameBuild }.`);
    }

    readLocalCacheFiles(): void {
        const js5StorePath = join(this.fileStore.fileStorePath, 'js5');

        if (!existsSync(js5StorePath)) {
            throw new Error(`${ js5StorePath } could not be found.`);
        }

        const stats = statSync(js5StorePath);
        if (!stats?.isDirectory()) {
            throw new Error(`${ js5StorePath } is not a valid directory.`);
        }

        const storeFileNames = readdirSync(js5StorePath);

        if (storeFileNames.indexOf(dataFileName) === -1) {
            throw new Error(`The main ${ dataFileName } data file could not be found.`);
        }

        if (storeFileNames.indexOf(mainIndexFileName) === -1) {
            throw new Error(`The main ${ mainIndexFileName } index file could not be found.`);
        }

        const dataFilePath = join(js5StorePath, dataFileName);
        const mainIndexFilePath = join(js5StorePath, mainIndexFileName);

        this.dataFile = new ByteBuffer(readFileSync(dataFilePath));
        this.mainIndexFile = new ByteBuffer(readFileSync(mainIndexFilePath));
        this.indexFiles.clear();

        for (const fileName of storeFileNames) {
            if (!fileName?.length || fileName === mainIndexFileName || fileName === dataFileName) {
                continue;
            }

            if (!fileName.startsWith(indexFileNamePrefix)) {
                continue;
            }

            const indexString = fileName.substring(fileName.indexOf('.idx') + 4);
            const archiveKey = Number(indexString);

            if (isNaN(archiveKey)) {
                logger.error(`Index file ${ fileName } does not have a valid extension.`);
            }

            this.indexFiles.set(archiveKey, new ByteBuffer(readFileSync(join(js5StorePath, fileName))));
            this.fileStore.createArchive(archiveKey);
        }

        logger.info(`JS5 store file loaded for game build ${ this.fileStore.gameBuild }.`);
    }

    unpack(file: Js5Group | Js5Archive): Buffer | null {
        const fileIndex = file.index;
        const fileKey = fileIndex.key;
        const archiveKey: number = file instanceof Js5Archive ? 255 : file.archive.index.key;
        const archiveName: string = file instanceof Js5Archive ? 'main' : file.archive.index.name;

        const indexChannel: ByteBuffer = archiveKey !== 255 ?
            this.indexFiles.get(archiveKey) : this.mainIndexFile;

        if (archiveKey === 255 && fileKey === 255) {
            return null;
        }

        const indexDataLength = 6;
        const dataChannel = this.dataFile;

        indexChannel.readerIndex = 0;
        dataChannel.readerIndex = 0;

        let pointer = fileKey * indexDataLength;

        if (pointer < 0 || pointer >= indexChannel.length) {
            logger.error(`File ${ fileKey } was not found within the ${ archiveName } archive index file.`);
            return null;
        }

        const fileIndexData = new ByteBuffer(indexDataLength);
        indexChannel.copy(fileIndexData, 0, pointer, pointer + indexDataLength);

        if (fileIndexData.readable !== indexDataLength) {
            logger.error(`Error extracting JS5 file ${ fileKey }: the end of the data stream was reached.`);
            return null;
        }

        fileIndex.fileSize = fileIndexData.get('int24', 'unsigned');
        const sectorNumber = fileIndexData.get('int24', 'unsigned');

        if (fileIndex.fileSize <= 0) {
            logger.warn(`JS5 file ${ fileKey } is empty or has been removed.`);
            return null;
        }

        const data = new ByteBuffer(fileIndex.fileSize);
        const sectorDataLength = 512;
        const sectorLength = 520;

        let sector = 0;
        let remainingData = fileIndex.fileSize;
        pointer = sectorNumber * sectorLength;

        do {
            const temp = new ByteBuffer(sectorLength);
            dataChannel.copy(temp, 0, pointer, pointer + sectorLength);

            if (temp.readable !== sectorLength) {
                logger.error(`Error reading stripe for packed file ${ fileKey }, the end of the data stream was reached.`);
                return null;
            }

            const sectorFileKey = temp.get('short', 'unsigned');
            const sectorFilePartNumber = temp.get('short', 'unsigned');
            const sectorNumber = temp.get('int24', 'unsigned');
            const sectorIndexKey = temp.get('byte', 'unsigned');

            const sectorData = new ByteBuffer(sectorDataLength);
            temp.copy(sectorData, 0, temp.readerIndex, temp.readerIndex + sectorDataLength);

            if (remainingData > sectorDataLength) {
                sectorData.copy(data, data.writerIndex, 0, sectorDataLength);
                data.writerIndex = (data.writerIndex + sectorDataLength);
                remainingData -= sectorDataLength;

                if (sectorIndexKey !== archiveKey) {
                    logger.error(`Archive index mismatch, expected archive ${ archiveKey } but found ${ sectorFileKey }`);
                    return null;
                }

                if (sectorFileKey !== fileKey) {
                    logger.error(`File index mismatch, expected ${ fileKey } but found ${ sectorFileKey }.`);
                    return null;
                }

                if (sectorFilePartNumber !== sector++) {
                    logger.error(`Error extracting JS5 file ${ fileKey }, file data is corrupted.`);
                    return null;
                }

                pointer = sectorNumber * sectorLength;
            } else {
                sectorData.copy(data, data.writerIndex, 0, remainingData);
                data.writerIndex = (data.writerIndex + remainingData);
                remainingData = 0;
            }
        } while (remainingData > 0);

        if (data.length) {
            fileIndex.compressedData = data.toNodeBuffer();
        } else {
            fileIndex.compressedData = null;
            fileIndex.fileError = 'FILE_MISSING';
        }

        return fileIndex.compressedData;
    }

    readCompressedFileHeader(file: Js5Group | Js5Archive): { compressedLength: number, readerIndex: number } {
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

    decrypt(file: Js5Group | Js5Archive): Buffer {
        const fileDetails = file.index;
        const fileName = fileDetails.name;

        if (!fileDetails.compressedData?.length) {
            logger.error(`Error decrypting file ${ fileName || fileDetails.key }, file data not found.`,
                `Please ensure that the file has been unpacked from an existing JS5 file store using JS5.unpack(file);`);
            return null;
        }

        const archiveName = file instanceof Js5Archive ? 'main' : file.archive.index.name;
        const archiveConfig = this.fileStore.archiveConfig[archiveName];

        if (archiveConfig.encryption) {
            const [ encryption, pattern ] = archiveConfig.encryption;
            const patternRegex = new RegExp(pattern);

            // Only XTEA encryption is supported at this time
            if (encryption !== 'xtea' || !patternRegex.test(fileName)) {
                // FileBase name does not match the pattern, data should be unencrypted
                return fileDetails.compressedData;
            }
        } else {
            return fileDetails.compressedData;
        }

        const gameBuild = this.fileStore.gameBuild;
        let keySets: XteaKeys[] = [];

        const loadedKeys = this.getEncryptionKeys(fileName);
        if (loadedKeys) {
            if (!Array.isArray(loadedKeys)) {
                keySets = [ loadedKeys ];
            } else {
                keySets = loadedKeys;
            }
        }

        const { compressedLength, readerIndex } = this.readCompressedFileHeader(file);
        const encryptedData = new ByteBuffer(fileDetails.compressedData);
        const keySet = keySets.find(keySet => keySet.gameBuild === gameBuild);

        if (Xtea.validKeys(keySet?.key)) {
            logger.info(`XTEA decryption keys found for file ` +
                `${ fileName || fileDetails.key }.`);

            const dataCopy = encryptedData.clone();
            dataCopy.readerIndex = readerIndex;

            let lengthOffset = readerIndex;
            if (dataCopy.length - (compressedLength + readerIndex + 4) >= 2) {
                lengthOffset += 2;
            }

            const decryptedData = Xtea.decrypt(dataCopy, keySet.key, dataCopy.length - lengthOffset);

            if (decryptedData?.length) {
                decryptedData.copy(dataCopy, readerIndex, 0);
                dataCopy.readerIndex = readerIndex;
                fileDetails.compressedData = dataCopy.toNodeBuffer();
                fileDetails.encrypted = false;
                file.validate(false);
                return fileDetails.compressedData;
            } else {
                logger.warn(`Invalid XTEA decryption keys found for file ` +
                    `${ fileName || fileDetails.key } using game build ${ gameBuild }.`);
                fileDetails.fileError = 'MISSING_ENCRYPTION_KEYS';
            }
        } else {
            logger.warn(`No XTEA decryption keys found for file ` +
                `${ fileName || fileDetails.key } using game build ${ gameBuild }.`);
            fileDetails.fileError = 'MISSING_ENCRYPTION_KEYS';
        }

        return null;
    }

    decompress(file: Js5Group | Js5Archive): Buffer | null {
        const fileDetails = file.index;

        if (!fileDetails.compressedData?.length) {
            return null;
        }

        if (!this.decrypt(file)) {
            fileDetails.encrypted = true;
            return null;
        }

        const { compressedLength, readerIndex } = this.readCompressedFileHeader(file);

        // JS5.decrypt will set compressedData to the new decrypted data after completion
        const compressedData = new ByteBuffer(fileDetails.compressedData);
        compressedData.readerIndex = readerIndex;
        let data: Buffer;

        if (fileDetails.compressionMethod === 'none') {
            // Uncompressed file
            data = Buffer.alloc(compressedLength);
            compressedData.copy(data, 0, compressedData.readerIndex, compressedLength);
            compressedData.readerIndex = (compressedData.readerIndex + compressedLength);
        } else {
            // BZIP or GZIP compressed file
            const decompressedLength = compressedData.get('int', 'unsigned');
            if (decompressedLength < 0) {
                const errorPrefix = `Unable to decompress file ${ fileDetails.name || fileDetails.key }:`;
                if (fileDetails.fileError === 'FILE_MISSING') {
                    logger.error(`${ errorPrefix } Missing file data.`);
                } else {
                    logger.error(`${ errorPrefix } Missing or invalid XTEA key.`);
                    fileDetails.fileError = 'MISSING_ENCRYPTION_KEYS';
                }
            } else {
                const fileData = new ByteBuffer(compressedLength);

                logger.info(`Decompress ${fileDetails.compressionMethod}, ` +
                    `compressed len = ${fileDetails.compressedData.length}, ` +
                    `recorded compressed len = ${compressedLength}, ` +
                    `compressed data buffer len = ${fileData.length}, ` +
                    `decompressed len = ${decompressedLength}`);

                compressedData.copy(fileData, 0, compressedData.readerIndex);

                try {
                    data = fileDetails.compressionMethod === 'bzip' ?
                        decompressHeadlessBzip2(fileData) :
                        decompressGzip(fileData);

                    compressedData.readerIndex = compressedData.readerIndex + compressedLength;

                    if (data.length !== decompressedLength) {
                        logger.error(`Compression length mismatch.`);
                        data = null;
                    }
                } catch (error) {
                    logger.error(`Error decompressing file ${ fileDetails.name || fileDetails.key }: ` +
                        `${ error?.message ?? error }`);
                    data = null;
                }
            }
        }

        if (data?.length) {
            // Read the file footer, if it has one
            if (compressedData.readable >= 2) {
                fileDetails.version = compressedData.get('short', 'unsigned');
            }

            fileDetails.data = data;
        }

        file.validate(false);
        return fileDetails.data;
    }

    async decodeGroup(group: Js5Group): Promise<void> {
        const groupDetails = group.index;
        const { key: groupKey, name: groupName } = groupDetails;
        const files = group.files;

        if (!groupDetails.data) {
            this.decompress(group);

            if (!groupDetails.data) {
                if (!groupDetails.fileError) {
                    logger.warn(`Unable to decode group ${ groupName || groupKey }.`);
                }
                return;
            }
        }

        const data = new ByteBuffer(groupDetails.data);

        if (groupDetails.childCount === 1) {
            return;
        }

        data.readerIndex = (data.length - 1); // EOF - 1 byte

        groupDetails.stripeCount = data.get('byte', 'unsigned');

        data.readerIndex = (data.length - 1 - groupDetails.stripeCount *
            groupDetails.childCount * 4); // Stripe data footer

        if (data.readerIndex < 0) {
            logger.error(`Invalid reader index of ${ data.readerIndex } for group ` +
                `${ groupName || groupKey }.`);
            return;
        }

        const fileSizeMap = new Map<number, number>();
        const fileStripeMap = new Map<number, number[]>();
        const fileDataMap = new Map<number, ByteBuffer>();

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
            file.validate(false);
        }

        group.validate(false);
    }

    async decodeArchive(archive: Js5Archive): Promise<void> {
        const archiveDetails = archive.index;

        if (archiveDetails.key === 255) {
            return;
        }

        const archiveName = archiveDetails.name;

        logger.info(`Decoding archive ${ archiveName }...`);

        if (!archiveDetails.data) {
            this.decompress(archive);

            if (!archiveDetails.data) {
                logger.error(`Unable to decode archive ${ archiveName }.`);
                return;
            }
        }

        const archiveData = new ByteBuffer(archiveDetails.data);
        const format = archiveDetails.archiveFormat = archiveData.get('byte', 'unsigned');
        const mainDataType = format >= ArchiveFormat.smart ? 'smart_int' : 'short';
        archiveDetails.version = format >= ArchiveFormat.versioned ? archiveData.get('int') : 0;
        const flags = archiveFlags(archiveData.get('byte', 'unsigned'));
        const groupCount = archiveData.get(mainDataType, 'unsigned');
        const groups: Js5Group[] = new Array(groupCount);
        let accumulator = 0;

        logger.info(`${ groupCount } groups were found within the ${ archiveName } archive.`);

        // Group index keys
        for (let i = 0; i < groupCount; i++) {
            const delta = archiveData.get(mainDataType, 'unsigned');
            const groupKey = accumulator += delta;
            const group = groups[i] = new Js5Group(this.fileStore, groupKey, archive);
            archive.setGroup(groupKey, group);
        }

        // Group name hashes
        if (flags.groupNames) {
            for (const group of groups) {
                group.index.nameHash = archiveData.get('int');
                group.index.name = this.fileStore.nameHasher.findFileName(
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
                const flatFile = new Js5File(this.fileStore, childFileIndex, group);
                group.setFile(childFileIndex, flatFile);
            }
        }

        // Grouped file names
        if (flags.groupNames) {
            for (const group of groups) {
                for (const [ , flatFile ] of group.files) {
                    flatFile.index.nameHash = archiveData.get('int');
                    flatFile.index.name = this.fileStore.nameHasher.findFileName(
                        flatFile.index.nameHash,
                        flatFile.index.name || String(flatFile.index.nameHash) || String(flatFile.index.key)
                    );
                }
            }
        }

        archive.validate(false);
    }

    // @todo stubbed - 21/07/22 - Kiko
    decodeMainIndex(): Buffer | null {
        return null;
    }

    // @todo stubbed - 21/07/22 - Kiko
    pack(file: Js5Group | Js5Archive): Buffer | null {
        return null;
    }

    // @todo stubbed - 21/07/22 - Kiko
    encrypt(file: Js5Group | Js5Archive): Buffer | null {
        return null;
    }

    compress(file: Js5Group | Js5Archive): Buffer | null {
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

            const compressedData: Buffer = fileDetails.compressionMethod === 'bzip' ?
                compressHeadlessBzip2(decompressedData) :
                compressGzip(decompressedData);

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

    encodeGroup(group: Js5Group): Buffer | null {
        const { files: fileMap, index, stripes } = group;
        const fileCount = fileMap.size;

        // Single-file group
        if (fileCount <= 1) {
            index.data = fileMap.get(0)?.index?.data || null;
            return index.data;
        }

        // Multi-file group
        const files = Array.from(fileMap.values());
        const fileSizes = files.map(file => file.index.fileSize);
        const stripeCount = stripes?.length ?? 1;

        // Size of all individual files + 1 int per file containing it's size
        // + 1 at the end for the total group stripe count
        const groupSize = fileSizes.reduce(
            (a, c) => a + c) + (stripeCount * fileCount * 4
        ) + 1;

        const groupBuffer = new ByteBuffer(groupSize);

        // Write child file data
        for (let stripe = 0; stripe < stripeCount; stripe++) {
            files.forEach(file => {
                const fileData = file.index.data;
                if (!fileData?.length) {
                    return;
                }

                const fileBuffer = new ByteBuffer(fileData);
                const stripeSize = file.stripes?.[stripe] ?? 0;

                if (stripeSize) {
                    const stripeData = fileBuffer.getSlice(fileBuffer.readerIndex, stripeSize);
                    fileBuffer.readerIndex = fileBuffer.readerIndex + stripeSize;
                    groupBuffer.putBytes(stripeData);
                }
            });
        }

        // Write child file stripe lengths
        for (let stripe = 0; stripe < stripeCount; stripe++) {
            let prevSize = 0;
            files.forEach(file => {
                const fileData = file.index.data;
                if (!fileData?.length) {
                    return;
                }

                const stripeLength = file.stripes?.[stripe] ?? 0;
                groupBuffer.put(stripeLength - prevSize, 'int');
                prevSize = stripeLength;
            });
        }

        // Write group child file stripe count
        groupBuffer.put(stripeCount, 'byte');

        if (groupBuffer.length) {
            index.data = groupBuffer.toNodeBuffer();
        } else {
            index.data = null;
        }

        return index.data;
    }

    // @todo support newer archive fields & formats - 21/07/22 - Kiko
    encodeArchive(archive: Js5Archive): Buffer | null {
        const { groups: groupMap, index } = archive;
        const groups = Array.from(groupMap.values());
        const groupCount = groups.length;
        const filesNamed = groups.filter(group => group.index.name !== null).length !== 0;
        let lastFileKey = 0;

        // @todo calculate the proper size instead of using a set amount here - 21/07/22 - Kiko
        const buffer = new ByteBuffer(1000 * 1000);

        // Write archive index file header
        buffer.put(index.archiveFormat ?? ArchiveFormat.original);
        buffer.put(filesNamed ? 1 : 0);
        buffer.put(groupCount, 'short');

        // Write group keys
        groups.forEach(group => {
            buffer.put(group.index.key - lastFileKey, 'short');
            lastFileKey = group.index.key;
        });

        // Write group names (if applicable)
        if (filesNamed) {
            groups.forEach(group => buffer.put(group.index.nameHash ?? -1, 'int'));
        }

        // Write uncompressed crc values
        groups.forEach(group => buffer.put(group.index.checksum ?? -1, 'int'));

        // Write group version numbers
        groups.forEach(group => buffer.put(group.index.version, 'int'));

        // Write group child file counts
        groups.forEach(group => buffer.put(group.files?.size ?? 1, 'short'));

        // Write group child file keys
        groups.forEach(group => {
            if (group.files.size > 1) {
                lastFileKey = 0;

                group.files.forEach(file => {
                    buffer.put(file.index.key - lastFileKey, 'short');
                    lastFileKey = file.index.key;
                });
            } else {
                buffer.put(0, 'short');
            }
        });

        // Write group child file names (if applicable)
        if (filesNamed) {
            groups.forEach(group => {
                if (group.files.size > 1) {
                    lastFileKey = 0;

                    group.files.forEach(file =>
                        buffer.put(file.index.nameHash ?? -1, 'int'));
                } else {
                    buffer.put(0, 'int');
                }
            });
        }

        const archiveIndexData = buffer?.flipWriter();

        if (archiveIndexData?.length) {
            index.data = archiveIndexData.toNodeBuffer();
        } else {
            index.data = null;
        }

        return index.data;
    }

    encodeMainIndex(): ByteBuffer {
        const archiveCount = this.fileStore.archives.size;
        const fileSize = 4 * archiveCount;

        const data = new ByteBuffer(fileSize + 31);

        data.put(0);
        data.put(fileSize, 'int');

        for (let archiveIndex = 0; archiveIndex < archiveCount; archiveIndex++) {
            data.put(this.fileStore.archives.get(archiveIndex).index.checksum, 'int');
        }

        this.mainIndexFile = data;
        return this.mainIndexFile;
    }

    getEncryptionKeys(fileName: string): XteaKeys | XteaKeys[] | null {
        if (this.openRS2EncryptionKeys?.length) {
            const fileKeys = this.openRS2EncryptionKeys.find(file => file.name === fileName);
            if (fileKeys) {
                return {
                    gameBuild: this.fileStore.gameBuild,
                    key: fileKeys.key
                };
            }
        }

        const keySets = this.localEncryptionKeys?.get(fileName);
        if (!keySets) {
            return null;
        }

        if (this.fileStore.gameBuild !== undefined) {
            return keySets.find(keySet => keySet.gameBuild === this.fileStore.gameBuild) ?? null;
        }

        return keySets;
    }

    async loadEncryptionKeys(): Promise<void> {
        if (/^\d+$/.test(this.fileStore.gameBuild)) {
            const openRS2Keys = await getXteaKeysByBuild(parseInt(this.fileStore.gameBuild, 10));

            if (openRS2Keys?.length) {
                logger.info(`XTEA keys found for build ${ this.fileStore.gameBuild } on OpenRS2.org.`);
                this.openRS2EncryptionKeys = openRS2Keys;
                return;
            }
        }

        logger.warn(`XTEA keys not found for build ${ this.fileStore.gameBuild } on OpenRS2.org, using local XTEA key files instead.`);
        const configPath = join(this.fileStore.fileStorePath, 'config', 'xtea');
        this.localEncryptionKeys = Xtea.loadKeys(configPath);

        if (!this.localEncryptionKeys.size) {
            throw new Error(`Error reading encryption key lookup table. ` +
                `Please ensure that the ${ configPath } file exists and is valid.`);
        }
    }

}
