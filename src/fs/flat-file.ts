import { createHash } from 'crypto';
import { join } from 'path';
import { existsSync, readFileSync, writeFileSync } from 'graceful-fs';
import { ByteBuffer, logger } from '@runejs/common';
import { Bzip2, getCompressionMethod, Gzip } from '@runejs/common/compress';
import { Xtea, XteaKeys } from '@runejs/common/encrypt';
import { FileError, FileIndex, FileProperties } from './index';
import { Crc32 } from '../util';
import { mkdirSync, rmSync } from 'fs';


export class FlatFile<T extends FileIndex = FileIndex> extends FileProperties<T> {

    protected _data: ByteBuffer | null;
    protected _loaded: boolean;
    protected _modified: boolean;
    protected _errors: FileError[];
    protected _js5Encoded: boolean;

    public constructor(index: string | number, properties?: Partial<FileProperties<T>>) {
        super(properties);
        this.fileKey = typeof index === 'number' ? String(index) : index;
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

        // Ensure that the file name and name hash are both present if one is supplied

        if(this.store) {
            if(this.name && this.nameHash === -1) {
                this.nameHash = this.store.hashFileName(this.name);
            } else if(!this.name && this.nameHash !== -1) {
                this.name = this.store.findFileName(this.nameHash);
            }
        }
    }

    public js5Decode(): ByteBuffer | null {
        return this._data;
    }

    public js5Encode(): ByteBuffer | null {
        return this._data;
    }

    public read(compress: boolean = false): ByteBuffer | null {
        if(!this.group) {
            throw new Error(`Flat file ${this.fileKey} could not be read as it does not belong to any known groups.`);
        }

        const filePath = this.path + this.type;

        if(!existsSync(filePath)) {
            logger.error(`Flat file not found: ${filePath}`);
            this.recordError(FileError.NOT_FOUND);
            return null;
        }

        const data = readFileSync(filePath);

        if(!data) {
            this.recordError(FileError.INVALID);
        } else if(!data.length) {
            this.recordError(FileError.EMPTY);
        } else {
            const fileData = new ByteBuffer(data);

            this.name = this.group.name;
            this.nameHash = this.group.nameHash;
            this.stripeSizes = this.fileIndex.stripeSizes;
            this.crc32 = this.fileIndex.crc32 ?? 0;
            this.sha256 = this.fileIndex.sha256 ?? undefined;

            this.setData(fileData, false);

            if(this.size !== this.fileIndex.size || this.sha256 !== this.generateSha256()) {
                this._modified = true;
            }

            this._loaded = true;

            return fileData;
        }

        logger.error(`Error reading file data: ${filePath}`);
        return null;
    }

    public write(): void {
        if(this.empty) {
            logger.error(`Error writing file ${this.name || this.fileKey}: File is empty.`);
            return;
        }

        const filePath = this.outputPath;
        const fileData = this.data.toNodeBuffer();

        if(existsSync(filePath)) {
            rmSync(filePath, { recursive: true, force: true });
        }

        writeFileSync(filePath, fileData);
    }

    public decrypt(): ByteBuffer {
        // Only XTEA encryption is supported for v1.0.0
        if(!this.encrypted || this.encryption !== 'xtea') {
            // Data is not encrypted
            return this._data;
        }

        if(this.archive?.config?.encryptionPattern) {
            // File name must match the given pattern to be encrypted
            if(!this.name) {
                throw new Error(`Error decrypting file ${this.fileKey}: File name not found.`);
            }

            const patternRegex = new RegExp(this.archive.config.encryptionPattern);

            if(!patternRegex.test(this.name)) {
                // File name does not match the pattern, data should be unencrypted
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
                logger.warn(`Invalid XTEA decryption keys found for file ${this.name || this.fileKey} using game version ${gameVersion}.`);
            }
        } else {
            // logger.warn(`No XTEA decryption keys found for file ${this.name || this.fileKey} using game version ${gameVersion}.`);
        }

        return this._data;
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
                const decompressedData = new ByteBuffer(
                    this.compression === 'bzip' ? decompressedLength :
                        (compressedData.length - compressedData.readerIndex + 2)
                );

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
                        logger.error(`Unable to decrypt file ${this.name || this.fileKey}.`);
                        this.archive?.incrementMissingEncryptionKeys();
                    } else {
                        logger.error(`Unable to decompress file ${this.name || this.fileKey}: ${error?.message ?? error}`);
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
                this.fileIndex.crc32 = this.crc32;
            }

            return this._data;
        } else {
            return null;
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

    public get data(): ByteBuffer {
        return this._data;
    }

    public get loaded(): boolean {
        return this._loaded;
    }

    public get modified(): boolean {
        return this._modified;
    }

    public get errors(): FileError[] {
        return this._errors;
    }

    public get js5Encoded(): boolean {
        return this._js5Encoded;
    }

    public set js5Encoded(value: boolean) {
        this._js5Encoded = value;
    }

    public get hasErrors(): boolean {
        return (this._errors?.length ?? 0) !== 0;
    }

    public get empty(): boolean {
        return !this._data?.length;
    }

    public get path(): string {
        const groupPath = this.group?.path || null;
        if(!groupPath) {
            throw new Error(`Error generating file path; File ${this.fileKey} has not been added to a group.`);
        }

        const extension = (this.archive?.config?.contentType || '');

        if(this.group.files.size === 1) {
            return groupPath + extension;
        } else {
            return join(groupPath, (this.name || this.fileKey) + extension);
        }
    }

    public get outputPath(): string {
        const groupOutputPath = this.group?.outputPath || null;
        if(!groupOutputPath) {
            throw new Error(`Error generating file output path; File ${this.fileKey} has not been added to a group.`);
        }

        const extension = (this.archive?.config?.contentType || '');

        if(this.group.files.size === 1) {
            return groupOutputPath + extension;
        } else {
            return join(groupOutputPath, (this.name || this.fileKey) + extension);
        }
    }

    public get type(): string {
        return this.archive?.config?.contentType ?? '';
    }

}
