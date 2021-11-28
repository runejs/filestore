import { createHash } from 'crypto';
import { join } from 'path';
import { ByteBuffer, logger } from '@runejs/common';
import { Bzip2, getCompressionMethod, Gzip } from '@runejs/common/compress';
import { Xtea, XteaKeys } from '@runejs/common/encrypt';
import { FileIndex, FileProperties, IndexBase } from './index';
import { Crc32 } from '../util';


export class BinaryFile<T extends IndexBase = FileIndex> extends FileProperties<T> {

    protected _data: ByteBuffer | null;

    public constructor(index: string | number, properties?: Partial<FileProperties<T>>) {
        super(properties);
        this.fileKey = typeof index === 'number' ? String(index) : index;

        // Ensure that the file name and name hash are both present if one is supplied

        if(this.name && this.nameHash === -1) {
            this.nameHash = this.store.hashFileName(this.name);
        } else if(!this.name && this.nameHash !== -1) {
            this.name = this.store.findFileName(this.nameHash);
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
    }

    public read(compress: boolean = false): void {
        // @TODO
    }

    public decrypt(): ByteBuffer {
        // Only XTEA encryption is supported for v1.0.0
        if(!this.encrypted || this.encryption !== 'xtea') {
            // Data is not encrypted
            return this._data;
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
                this.store?.incrementMissingEncryptionKeys();
                logger.warn(`Invalid XTEA keys found for file ${this.name} using game version ${gameVersion}.`);
            }
        } else {
            this.store?.incrementMissingEncryptionKeys();
            logger.warn(`No XTEA keys found for file ${this.name} using game version ${gameVersion}.`);
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

                data = this.compression === 'bzip' ? Bzip2.decompress(decompressedData) : Gzip.decompress(decompressedData);

                compressedData.readerIndex = compressedData.readerIndex + compressedLength;

                if(data.length !== decompressedLength) {
                    logger.error(`Compression length mismatch.`);
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

    public get data(): ByteBuffer {
        return this._data;
    }

    public get empty(): boolean {
        return !this._data?.length;
    }

    public get path(): string {
        const archivePath = this.archive?.path || null;
        const groupPath = this.group?.path || null;
        if(!groupPath && !archivePath) {
            throw new Error(`Error generating file path; File ${this.fileKey} has not been added to an archive or group.`);
        }

        return join(this.group?.path || this.archive?.path, this.name || this.fileKey);
    }

}
