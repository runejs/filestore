import { writeFileSync } from 'graceful-fs';
import { createHash } from 'crypto';
import { ByteBuffer, logger } from '@runejs/common';
import { Bzip2, CompressionMethod, getCompressionMethod, Gzip } from '@runejs/common/compress';
import { EncryptionMethod, Xtea, XteaKeys } from '@runejs/common/encrypt';
import { Crc32 } from '@runejs/common/crc32';

import { IndexEntity, IndexService } from './db';
import { Store } from './store';
import { Archive } from './archive';
import { Group } from './group';
import { isSet } from './util';
import { FileState } from './file-state';


export interface FileBreadcrumb {
    store: Store;
    archive: Archive;
    group: Group;
}


export abstract class IndexedFile<T extends IndexEntity> {

    public readonly key: string;
    public readonly store: Store;
    public readonly archive: Archive;
    public readonly group: Group;

    public index: T;
    public name: string = '';
    public nameHash: number = -1;
    public version: number = 0;
    public size: number = 0;
    public crc32: number = -1;
    public sha256: string = '';
    public encryption: EncryptionMethod | [ EncryptionMethod, string ] = 'none';
    public compression: CompressionMethod = 'none';
    public state: FileState = FileState.unloaded;

    protected _data: ByteBuffer | null = null;
    protected _modified: boolean = false;

    protected constructor(index: T, breadcrumb?: Partial<FileBreadcrumb>) {
        this.index = index;
        this.key = String(index.key);

        if(isSet(index.name)) {
            this.name = index.name;
        }
        if(isSet(index.size)) {
            this.size = index.size;
        }
        if(isSet(index.crc32)) {
            this.crc32 = index.crc32;
        }
        if(isSet(index.sha256)) {
            this.sha256 = index.sha256;
        }
        if(isSet(index['state'])) {
            this.state = FileState[index['state']];
        }

        if(breadcrumb) {
            const { store, archive, group } = breadcrumb;
            
            if(isSet(store)) {
                this.store = store;
            }
            if(isSet(archive)) {
                this.archive = archive;
            }
            if(isSet(group)) {
                this.group = group;
            }
        }

        // Attempt to infer the archive or store that this file belongs to, if not provided in the options

        if(!this.archive) {
            if(this.group?.archive) {
                this.archive = this.group.archive;
            }
        }

        if(!this.store) {
            if(this.archive?.store) {
                this.store = this.archive.store;
            } else if(this.group?.store) {
                this.store = this.group.store;
            }
        }

        this.encryption = this.archive?.config?.encryption || 'none';
        this.compression = this.archive?.config?.compression || 'none';
    }

    public unpack(): ByteBuffer | null {
        const archiveKey: number = this.archive ? this.archive.numericKey : 255;
        const fileKey = this.numericKey;
        const archiveName: string = this.archive ? this.archive.name : 'main';
        const indexChannel: ByteBuffer = archiveKey !== 255 ?
            this.store.js5ArchiveIndexes.get(String(archiveKey)) : this.store.js5MainIndex;

        if(archiveKey === 255 && fileKey === 255) {
            return null;
        }

        const indexDataLength = 6;
        const dataChannel = this.store.js5MainArchiveData;

        indexChannel.readerIndex = 0;
        dataChannel.readerIndex = 0;

        let pointer = fileKey * indexDataLength;

        if(pointer < 0 || pointer >= indexChannel.length) {
            logger.error(`File ${fileKey} was not found within the ${archiveName} archive index file.`);
            return null;
        }

        const fileIndexData = new ByteBuffer(indexDataLength);
        indexChannel.copy(fileIndexData, 0, pointer, pointer + indexDataLength);

        if(fileIndexData.readable !== indexDataLength) {
            logger.error(`Error extracting JS5 file ${fileKey}: the end of the data stream was reached.`);
            return null;
        }

        this.size = fileIndexData.get('int24', 'unsigned');
        const stripeCount = fileIndexData.get('int24', 'unsigned');

        if(this.size <= 0) {
            logger.warn(`Extracted JS5 file ${fileKey} has a recorded size of 0, no file data will be extracted.`);
            return null;
        }

        const data = new ByteBuffer(this.size);
        const stripeDataLength = 512;
        const stripeLength = 520;

        let stripe = 0;
        let remaining = this.size;
        pointer = stripeCount * stripeLength;

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
        } while(remaining > 0);

        if(data?.length) {
            this.setData(data, FileState.compressed);
        } else {
            this.setData(null, FileState.missing);
        }

        return data?.length ? data : null;
    }

    public pack(): ByteBuffer | null {
        return this._data; // @TODO needed for full re-packing of the data file
    }

    public decode(): ByteBuffer | null {
        return this._data; // stubbed
    }

    public encode(): ByteBuffer | null {
        return this._data; // stubbed
    }

    public decompress(): ByteBuffer | null {
        if(!this._data?.length) {
            return null;
        }

        this._data.readerIndex = 0;

        this.compression = getCompressionMethod(this._data.get('byte', 'unsigned'));
        const compressedLength = this._data.get('int', 'unsigned');

        const readerIndex = this._data.readerIndex;

        const compressedData = this.decrypt();
        compressedData.readerIndex = readerIndex;
        let data: ByteBuffer;

        if(this.compression === 'none') {
            // Uncompressed file
            data = new ByteBuffer(compressedLength);
            compressedData.copy(data, 0, compressedData.readerIndex, compressedLength);
            compressedData.readerIndex = (compressedData.readerIndex + compressedLength);
        } else {
            // BZIP or GZIP compressed file
            const decompressedLength = compressedData.get('int', 'unsigned');
            if(decompressedLength < 0) {
                logger.error(this.encryption === 'xtea' ? `Missing or invalid XTEA key.` :
                    `Invalid decompressed file length: ${decompressedLength}`);
            } else {
                const decompressedData = new ByteBuffer(this.compression === 'bzip' ?
                    decompressedLength : (compressedData.length - compressedData.readerIndex + 2));

                compressedData.copy(decompressedData, 0, compressedData.readerIndex);

                try {
                    data = this.compression === 'bzip' ? Bzip2.decompress(decompressedData) : Gzip.decompress(decompressedData);

                    compressedData.readerIndex = compressedData.readerIndex + compressedLength;

                    if(data.length !== decompressedLength) {
                        logger.error(`Compression length mismatch.`);
                        data = null;
                    }
                } catch(error) {
                    if(this.state === FileState.encrypted) {
                        logger.error(`Unable to decrypt file ${this.name || this.key}.`);
                        this.archive?.incrementMissingEncryptionKeys();
                    } else {
                        logger.error(`Unable to decompress file ${this.name || this.key}: ${error?.message ?? error}`);
                    }
                    data = null;
                }
            }
        }

        // Read the file footer, if it has one
        if(compressedData.readable >= 2) {
            this.version = compressedData.get('short', 'unsigned');
        }

        if((data?.length ?? 0) > 0) {
            this.setData(data, FileState.encoded);
        }

        return this._data ?? null;
    }

    public compress(): ByteBuffer | null {
        if(!this._data?.length) {
            return null;
        }

        const decompressedData = this._data;
        let data: ByteBuffer;

        if(this.compression === 'none') {
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

            const compressedData: ByteBuffer = this.compression === 'bzip' ?
                Bzip2.compress(decompressedData) : Gzip.compress(decompressedData);

            const compressedLength: number = compressedData.length;

            data = new ByteBuffer(compressedData.length + 9);

            // indicate which type of file compression was used (1 or 2)
            data.put(this.compression === 'bzip' ? 1 : 2);

            // write the compressed file length
            data.put(compressedLength, 'int');

            // write the uncompressed file length
            data.put(decompressedData.length, 'int');

            // write the compressed file data
            data.putBytes(compressedData);
        }

        return this.setData(data, FileState.compressed);
    }

    public decrypt(): ByteBuffer {
        if(this.state === FileState.encrypted) {
        // if(this.archive?.config?.encryption) {
            // File name must match the given pattern to be encrypted
            if(!this.name) {
                throw new Error(`Error decrypting file ${this.key}: File name not found.`);
            }

            if(Array.isArray(this.archive.config.encryption)) {
                const [ encryption, pattern ] = this.archive.config.encryption;
                const patternRegex = new RegExp(pattern);

                // Only XTEA encryption is supported for v1.0.0
                if(encryption !== 'xtea' || !patternRegex.test(this.name)) {
                    // File name does not match the pattern, data should be unencrypted
                    this.setState(FileState.decrypted);
                    return this._data;
                }
            } else if(this.archive.config.encryption !== 'xtea') {
                // Only XTEA encryption is supported for v1.0.0
                this.setState(FileState.decrypted);
                return this._data;
            }
        }

        const gameBuild = this.store.gameBuild ?? null;

        // XTEA requires that we know which game build is running so that we pick the correct keystore file
        if(!gameBuild) {
            if(this.store && !this.store.gameBuildMissing) {
                this.store.setGameBuildMissing();
                logger.warn(`Game build must be supplied to decompress XTEA encrypted files.`,
                    `Please provide the game build using the --build argument.`);
            }

            this.setState(FileState.decrypted);
            return this._data;
        }

        let keySets: XteaKeys[] = [];

        const loadedKeys = this.store.getEncryptionKeys(this.name);
        if(loadedKeys) {
            if(!Array.isArray(loadedKeys)) {
                keySets = [ loadedKeys ];
            } else {
                keySets = loadedKeys;
            }
        }

        this._data.readerIndex = 0;

        this.compression = getCompressionMethod(this._data.get('byte', 'unsigned'));
        const compressedLength = this._data.get('int', 'unsigned');

        const readerIndex = this._data.readerIndex;

        const keySet = keySets.find(keySet => keySet.gameBuild === gameBuild);

        if(Xtea.validKeys(keySet?.key)) {
            const dataCopy = this._data.clone();
            dataCopy.readerIndex = readerIndex;

            let lengthOffset = readerIndex;
            if(dataCopy.length - (compressedLength + readerIndex + 4) >= 2) {
                lengthOffset += 2;
            }

            const decryptedData = Xtea.decrypt(dataCopy, keySet.key, dataCopy.length - lengthOffset);

            if(decryptedData?.length) {
                decryptedData.copy(dataCopy, readerIndex, 0);
                dataCopy.readerIndex = readerIndex;
                this.setState(FileState.decrypted);
                return dataCopy;
            } else {
                logger.warn(`Invalid XTEA decryption keys found for file ${this.name || this.key} using game build ${gameBuild}.`);
            }
        } else {
            // logger.warn(`No XTEA decryption keys found for file ${this.name || this.fileKey} using game build ${gameBuild}.`);
        }

        return this._data;
    }

    public read(compress?: boolean): ByteBuffer | null | Promise<ByteBuffer | null> {
        if(this.state === FileState.unloaded) {
            this.setState(FileState.loaded);
        }

        return this._data;
    }

    public write(): void {
        if(this._data?.length) {
            writeFileSync(this.outputPath, Buffer.from(this._data));
        }
    }

    public setData(data: Buffer, state: FileState): ByteBuffer | null;
    public setData(data: ByteBuffer, state: FileState): ByteBuffer | null;
    public setData(data: ByteBuffer | Buffer, state: FileState): ByteBuffer | null;
    public setData(data: ByteBuffer | Buffer, state: FileState): ByteBuffer | null {
        this.size = data?.length ?? 0;

        if(this.size) {
            this._data = new ByteBuffer(data);
            this._data.readerIndex = 0;
            this._data.writerIndex = 0;
        } else {
            this._data = null;
        }

        this.state = state;

        if(state === FileState.compressed) {
            this.generateCrc32();
        } else if(state === FileState.raw || state === FileState.encoded) {
            this.generateSha256();
        }

        return this._data;
    }

    public generateCrc32(): number {
        this.crc32 = this._data?.length ? Crc32.update(0, this.size, Buffer.from(this._data)) : -1;
        return this.crc32;
    }

    public generateSha256(): string {
        this.sha256 = this._data?.length ? createHash('sha256')
            .update(Buffer.from(this._data)).digest('hex') : '';
        return this.sha256;
    }

    public setState(fileState: FileState): void {
        this.state = fileState;
    }

    public abstract get path(): string;

    public abstract get outputPath(): string;

    public get numericKey(): number {
        return Number(this.key);
    }

    public get named(): boolean {
        if(!this.name) {
            return false;
        }

        return !/^\d+$/.test(this.name);
    }

    public get hasNameHash(): boolean {
        return isSet(this.nameHash) && !isNaN(this.nameHash) && this.nameHash !== -1;
    }

    public get data(): ByteBuffer {
        return this._data;
    }

    public get indexService(): IndexService {
        return this.store.indexService;
    }

    public get type(): string {
        return this.archive?.config?.contentType ?? '';
    }

    public get empty(): boolean {
        return (this._data?.length ?? 0) !== 0;
    }

    public get modified(): boolean {
        return this.index.crc32 !== this.crc32 || this.index.sha256 !== this.sha256 || this.index.size !== this.size;
    }

}
