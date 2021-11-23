import { createHash } from 'crypto';
import { ByteBuffer, logger } from '@runejs/common';
import { Bzip2, FileCompression, Gzip } from '@runejs/common/compression';
import { Xtea, XteaKeys } from '../encryption';
import { EncryptionMethod, StoreConfig } from '../config';
import { Crc32 } from '../util';
import { FileOptions } from './index';


export abstract class AssetFile {

    public static xteaMissingKeys = 0;
    public static xteaWarningDisplayed = false;

    public readonly index: string;

    protected _data: ByteBuffer | undefined;
    protected _encryption: EncryptionMethod;
    protected _encrypted: boolean;
    protected _compression: FileCompression;
    protected _compressed: boolean;
    protected _name: string;
    protected _nameHash: number | undefined;
    protected _version: number | undefined;
    protected _size: number;
    protected _stripeCount: number;
    protected _stripeSizes: number[];
    protected _crc32: number;
    protected _sha256: string;

    protected constructor(index: string | number, options?: FileOptions) {
        this.index = typeof index === 'number' ? String(index) : index;
        this._version = 0;
        this._size = 0;

        if(options?.encryption) {
            this.encryption = options.encryption;
        }

        if(options?.compression) {
            this.compression = options.compression;
        }

        if(!!options?.encrypted) {
            this._encrypted = options.encrypted;
        }

        if(!!options?.compressed) {
            this._compressed = options.compressed;
        }
    }

    public decrypt(): ByteBuffer {
        // Only XTEA encryption is supported for v1.0.0
        if(!this.encrypted || this.encryption !== 'xtea') {
            // Data is not encrypted
            return this._data;
        }

        const gameVersion = StoreConfig.gameVersion;

        // XTEA requires that we know which game version is running so that we pick the correct keystore file
        if(!gameVersion) {
            if(!AssetFile.xteaWarningDisplayed) {
                logger.warn(`Game version must be supplied to decompress XTEA encrypted files.`,
                    `Please provide the JS5 file store game version using the --version ### argument.`);
                AssetFile.xteaWarningDisplayed = true;
            }

            return this._data;
        }

        let keySets: XteaKeys[] = [];

        const loadedKeys = StoreConfig.getXteaKey(this.name);
        if(loadedKeys) {
            if(!Array.isArray(loadedKeys)) {
                keySets = [ loadedKeys ];
            } else {
                keySets = loadedKeys;
            }
        }

        this._data.readerIndex = 0;

        this.compression = this._data.get('byte', 'unsigned');
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
                AssetFile.xteaMissingKeys++;
                logger.warn(`Invalid XTEA keys found for file ${this.name} with game version ${gameVersion}.`);
            }
        } else {
            AssetFile.xteaMissingKeys++;
            logger.warn(`No XTEA keys found for file ${this.name} with game version ${gameVersion}.`);
        }

        return this._data;
    }

    public decompress(): ByteBuffer | null {
        if(!this.compressed) {
            this._data.readerIndex = 0;
            return this._data;
        }

        if(!this._data?.length) {
            return null;
        }

        this._data.readerIndex = 0;

        this.compression = this._data.get('byte', 'unsigned');
        const compressedLength = this._data.get('int', 'unsigned');

        const readerIndex = this._data.readerIndex;

        const compressedData = this.decrypt();
        compressedData.readerIndex = readerIndex;
        let data: ByteBuffer;

        if(this.compression === FileCompression.none) {
            // Uncompressed file
            data = new ByteBuffer(compressedLength);
            compressedData.copy(data, 0, compressedData.readerIndex, compressedLength);
            compressedData.readerIndex = (compressedData.readerIndex + compressedLength);
        } else {
            // Compressed file

            try {
                const decompressedLength = compressedData.get('int', 'unsigned');
                if(decompressedLength < 0) {
                    throw new Error(this.encryption === 'xtea' ? `Missing or invalid XTEA key.` :
                        `Invalid decompressed file length: ${decompressedLength}`);
                }

                const decompressedData = new ByteBuffer(
                    this.compression === FileCompression.bzip ?
                        decompressedLength : (compressedData.length - compressedData.readerIndex + 2)
                );

                compressedData.copy(decompressedData, 0, compressedData.readerIndex);

                data = this.compression === FileCompression.bzip ?
                    Bzip2.decompress(decompressedData) : Gzip.decompress(decompressedData);

                compressedData.readerIndex = compressedData.readerIndex + compressedLength;

                if(data.length !== decompressedLength) {
                    throw new Error(`Compression length mismatch.`);
                }
            } catch(error) {
                logger.error(`Error decompressing file ${this._name}: ${error?.message ?? error}`);
                data = null;
            }
        }

        // Read the file footer
        if(compressedData.readable >= 2) {
            this.version = compressedData.get('short', 'unsigned');
        }

        if((data?.length ?? 0) > 0) {
            this.setData(data, false);
        }

        this._data.readerIndex = 0;
        return this._data;
    }

    public compress(): ByteBuffer | null {
        if(this.compressed) {
            return this._data;
        }

        if(!this._data?.length) {
            return null;
        }

        const decompressedData = this._data;
        let data: ByteBuffer;

        if(this.compression === FileCompression.none) {
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

            const compressedData: ByteBuffer = this.compression === FileCompression.bzip ?
                Bzip2.compress(decompressedData) : Gzip.compress(decompressedData);

            const compressedLength: number = compressedData.length;

            data = new ByteBuffer(compressedData.length + 9);

            // indicate which type of file compression was used (1 or 2)
            data.put(this.compression);

            // write the compressed file length
            data.put(compressedLength, 'int');

            // write the uncompressed file length
            data.put(decompressedData.length, 'int');

            // write the compressed file data
            data.putBytes(compressedData);
        }

        if(data?.length) {
            this.setData(data.flipWriter(), true);
        }

        return this._data;
    }

    public setData(data: ByteBuffer, compressed: boolean): void {
        if(data) {
            data.readerIndex = 0;
            data.writerIndex = 0;
            this._data = data;
        } else {
            this._data = new ByteBuffer([]);
        }

        this._compressed = compressed;
        this._size = data.length;
    }

    public generateCrc32(): number | undefined {
        this._crc32 = !this.empty ? Crc32.calculateCrc(0, this.size, this._data) : undefined;
        return this._crc32;
    }

    public generateSha256(): string | undefined {
        this._sha256 = !this.empty ? createHash('sha256')
            .update(this._data.toNodeBuffer()).digest('hex') : undefined;
        return this._sha256;
    }

    public get numericIndex(): number {
        return Number(this.index);
    }

    public get encryption(): EncryptionMethod {
        return this._encryption;
    }

    public set encryption(value: EncryptionMethod) {
        this._encryption = value;
    }

    public get compression(): FileCompression {
        return this._compression ?? FileCompression.none;
    }

    public set compression(compression: FileCompression) {
        this._compression = compression;
    }

    public get encrypted(): boolean {
        return this._encrypted;
    }

    public set encrypted(value: boolean) {
        this._encrypted = value;
    }

    public get compressed(): boolean {
        return this._compressed;
    }

    public set compressed(value: boolean) {
        this._compressed = value;
    }

    public get crc32(): number {
        return this._crc32;
    }

    public set crc32(value: number) {
        this._crc32 = value;
    }

    public get sha256(): string {
        return this._sha256;
    }

    public set sha256(value: string) {
        this._sha256 = value;
    }

    public get version(): number | undefined {
        return this._version;
    }

    public set version(value: number) {
        this._version = value;
    }

    public get nameHash(): number | undefined {
        return this._nameHash;
    }

    public set nameHash(nameHash: number) {
        this._nameHash = nameHash;
        if(nameHash) {
            this._name = StoreConfig.getFileName(nameHash);
        }
    }

    public get name(): string {
        return this._name;
    }

    public set name(name: string) {
        this._name = name;
        if(name) {
            this._nameHash = StoreConfig.hashFileName(name);
        }
    }

    public get data(): ByteBuffer {
        return this._data;
    }

    public get size(): number {
        return this._size;
    }

    public set size(value: number) {
        this._size = value;
    }

    public get empty(): boolean {
        return !this._data?.length;
    }

    public get stripeCount(): number {
        return this._stripeCount;
    }

    public set stripeCount(value: number) {
        this._stripeCount = value;
    }

    public get stripeSizes(): number[] {
        return this._stripeSizes;
    }

    public set stripeSizes(value: number[]) {
        this._stripeSizes = value;
    }
}
