import { IndexEntity, IndexService } from '../db';
import { ByteBuffer, logger } from '@runejs/common';
import { Bzip2, CompressionMethod, getCompressionMethod, Gzip } from '@runejs/common/compress';
import { EncryptionMethod, Xtea, XteaKeys } from '@runejs/common/encrypt';
import { Crc32 } from '../util';
import { createHash } from 'crypto';
import { FileError } from './file-error';
import { Store } from './store';
import { Archive } from './archive';
import { Group } from './group';


export interface AdditionalFileProperties {
    store: Store;
    archive: Archive;
    group: Group;
    encryption: EncryptionMethod | [ EncryptionMethod, string ];
    encrypted: boolean;
    compression: CompressionMethod;
    compressed: boolean;
}


export abstract class IndexedFile<T extends IndexEntity> {

    public readonly key: string;
    public readonly index: T;
    public readonly store: Store;
    public readonly archive: Archive;
    public readonly group: Group;

    public name: string = '';
    public nameHash: number = -1;
    public version: number = 0;
    public size: number = 0;
    public crc32: number = -1;
    public sha256: string = '';
    public stripes: number[] = [];
    public stripeCount: number = 1;
    public encryption: EncryptionMethod | [ EncryptionMethod, string ] = 'none';
    public encrypted: boolean = false;
    public compression: CompressionMethod = 'none';
    public compressed: boolean = false;

    protected _data: ByteBuffer | null = null;
    protected _js5Encoded: boolean = false;
    protected _loaded: boolean = false;
    protected _modified: boolean = false;
    protected _errors: FileError[] = [];

    protected constructor(index: T, properties?: Partial<AdditionalFileProperties>) {
        this.index = index;
        this.key = String(index.key);

        if(this.isSet(index.name)) {
            this.name = index.name;
        }
        if(this.isSet(index.nameHash)) {
            this.nameHash = index.nameHash;
        }
        if(this.isSet(index.version)) {
            this.version = index.version;
        }
        if(this.isSet(index.size)) {
            this.size = index.size;
        }
        if(this.isSet(index.crc32)) {
            this.crc32 = index.crc32;
        }
        if(this.isSet(index.sha256)) {
            this.sha256 = index.sha256;
        }

        if(this.isSet(properties?.store)) {
            this.store = properties.store;
        }
        if(this.isSet(properties?.archive)) {
            this.archive = properties.archive;
        }
        if(this.isSet(properties?.group)) {
            this.group = properties.group;
        }
        if(this.isSet(properties?.encryption)) {
            this.encryption = properties.encryption;
        }
        if(this.isSet(properties?.encrypted)) {
            this.encrypted = properties.encrypted;
        }
        if(this.isSet(properties?.compression)) {
            this.compression = properties.compression;
        }
        if(this.isSet(properties?.compressed)) {
            this.compressed = properties.compressed;
        }

        if(this.isSet(index['stripes'])) {
            this.stripes = index['stripes'].split(',').map(n => Number(n));
        }

        if(this.isSet(index['stripeCount'])) {
            this.stripeCount = Number(index['stripeCount']);
        }

        this._errors = [];
        this._js5Encoded = false;

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
    }

    public setData(data: ByteBuffer, compressed: boolean): void {
        if(data) {
            data.readerIndex = 0;
            data.writerIndex = 0;
            this._data = data;
            this.size = data.length;
        } else {
            this._data = null;
            this.size = 0;
        }

        this.compressed = compressed;
    }

    public js5Decode(): ByteBuffer | null {
        const archive = this.archive;
        if(!archive) {
            logger.error(`JS5 file ${this.key} does not belong to an archive.`);
            return null;
        }

        const indexDataLength = 6;
        const usingMainIndex = archive.numericKey === 255;
        const indexChannel = usingMainIndex ? this.store.js5MainIndex : this.store.js5ArchiveIndexes.get(this.archive?.key ?? this.key);
        const dataChannel = this.store.js5MainArchiveData;

        indexChannel.readerIndex = 0;
        dataChannel.readerIndex = 0;

        let pointer = this.numericKey * indexDataLength;

        if(pointer < 0 || pointer >= indexChannel.length) {
            if(!usingMainIndex) {
                logger.error(`File ${this.key} was not found within the JS5 ${archive.name} archive index file.`);
            } else {
                logger.error(`Archive ${this.key} was not found within the main index file.`);
            }

            return null;
        }

        const fileIndexData = new ByteBuffer(indexDataLength);
        indexChannel.copy(fileIndexData, 0, pointer, pointer + indexDataLength);

        if(fileIndexData.readable !== indexDataLength) {
            logger.error(`Error extracting JS5 file ${this.key}: the end of the data stream was reached.`);
            return null;
        }

        this.size = fileIndexData.get('int24', 'unsigned');
        const stripeCount = fileIndexData.get('int24', 'unsigned');

        if(this.size <= 0) {
            logger.warn(`Extracted JS5 file ${this.key} has a recorded size of 0, no file data will be extracted.`);
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
                logger.error(`Error reading stripe for packed file ${this.key}, the end of the data stream was reached.`);
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

                if(stripeArchiveIndex !== this.archive.numericKey) {
                    logger.error(`Archive index mismatch, expected archive ${this.archive.key} but found archive ${stripeFileIndex}`);
                    return null;
                }

                if(stripeFileIndex !== this.numericKey) {
                    logger.error(`File index mismatch, expected ${this.key} but found ${stripeFileIndex}.`);
                    return null;
                }

                if(currentStripe !== stripe++) {
                    logger.error(`Error extracting JS5 file ${this.key}, file data is corrupted.`);
                    return null;
                }

                pointer = nextStripe * stripeLength;
            } else {
                stripeData.copy(data, data.writerIndex, 0, remaining);
                data.writerIndex = (data.writerIndex + remaining);
                remaining = 0;
            }
        } while(remaining > 0);

        return data?.length ? data : null;
    }

    public js5Encode(): ByteBuffer | null {
        return this._data; // @TODO
    }

    public decompress(): ByteBuffer | null {
        if(!this.compressed && !this.empty) {
            this._data.readerIndex = 0;
            return this._data;
        }

        if(this.empty) {
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
                    if(this.encrypted) {
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
            this.setData(data, false);
            this._data.readerIndex = 0;
        }

        return this._data ?? null;
    }

    public compress(): ByteBuffer | null {
        if(!this.empty && (this.compressed || this.compression === 'none')) {
            return this._data;
        }

        if(this.empty) {
            return null;
        }

        const originalCrc = this.crc32;

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

        if(data?.length) {
            this.setData(data.flipWriter(), true);

            this.generateCrc32();

            if(originalCrc !== this.crc32) {
                // logger.warn(`Archive ${this.name} checksum has changed from ${originalCrc} to ${this.crc32}.`);
                this.index.crc32 = this.crc32;
            }

            return this._data;
        } else {
            return null;
        }
    }

    public decrypt(): ByteBuffer {
        if(!this.encrypted) {
            // Data is not encrypted
            return this._data;
        }

        if(this.archive?.config?.encryption) {
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
                    this.encrypted = false;
                    return this._data;
                }
            } else if(this.archive.config.encryption !== 'xtea') {
                // Only XTEA encryption is supported for v1.0.0
                this.encrypted = false;
                return this._data;
            }
        }

        const gameVersion = this.store.gameVersion ?? null;

        // XTEA requires that we know which game version is running so that we pick the correct keystore file
        if(!gameVersion) {
            if(this.store && !this.store.gameVersionMissing) {
                this.store.setGameVersionMissing();
                logger.warn(`Game version must be supplied to decompress XTEA encrypted files.`,
                    `Please provide the JS5 file store game version using the --version ### argument.`);
            }

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

        const keySet = keySets.find(keySet => keySet.gameVersion === gameVersion);

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
                return dataCopy;
            } else {
                logger.warn(`Invalid XTEA decryption keys found for file ${this.name || this.key} using game version ${gameVersion}.`);
            }
        } else {
            // logger.warn(`No XTEA decryption keys found for file ${this.name || this.fileKey} using game version ${gameVersion}.`);
        }

        return this._data;
    }

    public validate(): void | Promise<void> {
        const isNamed = !!this.name && this.name.length;
        let name = this.name;
        let nameHash: number | undefined = undefined;

        if(!isNamed) {
            if(this.hasNameHash) {
                name = this.store.findFileName(this.nameHash, String(this.nameHash));
                nameHash = this.nameHash;
            } else {
                name = this.key;
            }
        } else if(this.hasNameHash) {
            this.nameHash = this.store.hashFileName(name);
        }

        this.index.data = this.data?.toNodeBuffer() ?? null;
    }

    public generateCrc32(): number {
        this.crc32 = !this.empty ? Crc32.update(0, this.size, this._data) : -1;
        return this.crc32;
    }

    public generateSha256(): string {
        this.sha256 = !this.empty ? createHash('sha256')
            .update(this._data.toNodeBuffer()).digest('hex') : '';
        return this.sha256;
    }

    public clearErrors(): void {
        this._errors = [];
    }

    public recordError(error: FileError): void {
        if(!this.hasErrors) {
            this._errors = [ error ];
        } else if(this._errors.indexOf(error) === -1) {
            this._errors.push(error);
        }
    }

    protected isSet(variable: any): boolean {
        return variable !== undefined && variable !== null;
    }

    public abstract read(compress?: boolean): ByteBuffer | null | Promise<ByteBuffer | null>;

    public abstract write(): void | Promise<void>;

    public get numericKey(): number {
        return Number(this.key);
    }

    public get hasNameHash(): boolean {
        return this.nameHash !== undefined && this.nameHash !== null && this.nameHash !== -1 && !isNaN(this.nameHash);
    }

    public get data(): ByteBuffer {
        return this._data;
    }

    public get js5Encoded(): boolean {
        return this._js5Encoded;
    }

    public set js5Encoded(value: boolean) {
        this._js5Encoded = value;
    }

    public get loaded(): boolean {
        return this._loaded;
    }

    public get empty(): boolean {
        return !this._data?.length;
    }

    public get modified(): boolean {
        return this._modified;
    }

    public get errors(): FileError[] {
        return this._errors;
    }

    public get hasErrors(): boolean {
        return (this._errors?.length ?? 0) !== 0;
    }

    public get indexService(): IndexService {
        return this.store.indexService;
    }

    public abstract get path(): string;

    public abstract get outputPath(): string;

}
