import { logger, ByteBuffer } from '@runejs/common';
import { Js5File } from './js5-file';
import { Js5Archive } from './js5-archive';
import { FileOptions } from '../fs';


export class Js5Group extends Js5File {

    public readonly files: Map<string, Js5File>;

    protected _fileSizes: Map<string, number>;
    protected _encoded: boolean;

    public constructor(index: string | number, archive: Js5Archive, options?: FileOptions) {
        super(index, archive, options);
        this.files = new Map<string, Js5File>();
        this._encoded = true;
    }

    public decode(): void {
        if(!this._encoded) {
            return;
        }

        if(!this._data?.length) {
            this.extractPackedFile();
        }

        this.encryption = this.archive.details.encryption ?? 'none';
        this.encrypted = (this.archive.details.encryption ?? 'none') !== 'none';

        if(this.compressed) {
            this.decompress();
        }

        this.generateSha256();

        if(this.files.size === 1) {
            const onlyChild: Js5File = Array.from(this.files.values())[0];
            onlyChild.nameHash = this.nameHash;
            onlyChild.setData(this._data, this.compressed);
            onlyChild.sha256 = this.sha256;
            onlyChild.crc32 = this.crc32;
            onlyChild.encryption = this.archive.details.encryption ?? 'none';
            onlyChild.encrypted = (this.archive.details.encryption ?? 'none') !== 'none';
        } else {
            const dataLength = this._data?.length ?? 0;

            if(!dataLength) {
                logger.error(`Error decoding group ${this.index}`);
                return;
            }

            this._data.readerIndex = (dataLength - 1); // EOF

            this._stripeCount = this._data.get('byte', 'unsigned');

            this._fileSizes = new Map<string, number>();

            this._data.readerIndex = (dataLength - 1 - this._stripeCount * this.files.size * 4); // Stripe data footer

            for(let stripe = 0; stripe < this._stripeCount; stripe++) {
                let currentLength = 0;
                for(const [ fileIndex, file ] of this.files) {
                    const delta = this._data.get('int');
                    currentLength += delta;

                    if(!file.stripeSizes?.length) {
                        file.stripeSizes = new Array(this._stripeCount);
                    }

                    let size = 0;
                    if(!this._fileSizes.has(fileIndex)) {
                        this._fileSizes.set(fileIndex, 0);
                    } else {
                        size = this._fileSizes.get(fileIndex);
                    }

                    file.stripeSizes[stripe] = currentLength;
                    this._fileSizes.set(fileIndex, size + currentLength);
                }
            }

            for(const [ fileIndex, file ] of this.files) {
                const fileSize = this._fileSizes.get(fileIndex) || 0;
                file.setData(new ByteBuffer(fileSize), false);
                file.size = fileSize;
            }

            this._data.readerIndex = 0;

            for(let stripe = 0; stripe < this._stripeCount; stripe++) {
                for(const [ , file ] of this.files) {
                    if(file.empty) {
                        continue;
                    }

                    let stripeLength = file.stripeSizes[stripe];

                    let sourceEnd: number = this._data.readerIndex + stripeLength;
                    if(this._data.readerIndex + stripeLength >= this._data.length) {
                        sourceEnd = this._data.length;
                        stripeLength = (this._data.readerIndex + stripeLength) - this._data.length;
                    }

                    const stripeData = this._data.getSlice(this._data.readerIndex, stripeLength);

                    file.data.putBytes(stripeData);

                    file.generateSha256();

                    this._data.readerIndex = sourceEnd;
                }
            }
        }

        this._encoded = false;
    }

    /**
     * Fetches the first file from this group.
     */
    public getFirstFile(): Js5File {
        const files = Array.from(this.files.values());
        if(files?.length) {
            return files[0];
        }

        return null;
    }

    /**
     * Adds a new or replaces an existing file within the group.
     * @param fileIndex The index of the file to add or change.
     * @param file The file to add or change.
     */
    public setFile(fileIndex: number | string, file: Js5File): void {
        this.files.set(typeof fileIndex === 'number' ? String(fileIndex) : fileIndex, file);
    }

    /**
     * Fetches a file from this group by index.
     * @param fileIndex The index of the file to find.
     */
    public getFile(fileIndex: number | string): Js5File | null {
        return this.files.get(typeof fileIndex === 'number' ? String(fileIndex) : fileIndex) ?? null;
    }

    /**
     * Fetches a file from this group by file name.
     * @param fileName The name of the file to find.
     */
    public findFile(fileName: string): Js5File {
        return Array.from(this.files.values()).find(file => file?.name === fileName) ?? null;
    }

    public get fileSizes(): Map<string, number> {
        return this._fileSizes;
    }

    public get encoded(): boolean {
        return this._encoded;
    }
}
