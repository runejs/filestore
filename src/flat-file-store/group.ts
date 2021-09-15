import { ByteBuffer } from '@runejs/common/buffer';
import { Archive } from './archive';
import { File } from './file';
import { GroupIndex } from './archive-index';
import { join } from 'path';
import { existsSync, readdirSync, statSync } from 'graceful-fs';
import { logger } from '@runejs/common';
import { IndexedFileEntry } from './indexed-file-entry';


export class Group extends IndexedFileEntry<GroupIndex> {

    public readonly archive: Archive;
    public readonly files: Map<string, File>;

    private _encoded: boolean;

    public constructor(index: string | number, archive: Archive, indexData?: GroupIndex) {
        super(index, archive.store, indexData);
        this.archive = archive;
        this.files = new Map<string, File>();
        this._encoded = false;
    }

    public encode(): ByteBuffer {
        if(this._encoded) {
            return this._data;
        }

        if(this.files.size > 1) {
            const fileData: ByteBuffer[] = Array.from(this.files.values()).map(file => file?.data ?? new ByteBuffer(0));
            const fileSizes = fileData.map(data => data.length);
            const fileCount = fileSizes.length;
            const stripeCount = this.stripeCount ?? 1;

            if(!stripeCount) {
                return null;
            }

            // Size of all individual files + 1 int per file containing it's size
            // + 1 at the end for the total group stripe count
            const groupSize = fileSizes.reduce((a, c) => a + c) + (stripeCount * fileCount * 4) + 1;
            const groupBuffer = new ByteBuffer(groupSize);

            fileData.forEach(data => data.readerIndex = 0);

            // Write file content stripes
            for(let stripe = 0; stripe < stripeCount; stripe++) {
                for(const [ , file ] of this.files) {
                    const stripeSize = file.stripeSizes[stripe];

                    if(stripeSize) {
                        const stripeData = file.data.getSlice(file.data.readerIndex, stripeSize);
                        file.data.readerIndex = file.data.readerIndex + stripeSize;
                        groupBuffer.putBytes(stripeData);
                    }
                }
            }

            for(let stripe = 0; stripe < stripeCount; stripe++) {
                let prevSize = 0;
                for(const [ , file ] of this.files) {
                    const stripeSize = file.stripeSizes[stripe] ?? 0;
                    groupBuffer.put(stripeSize - prevSize, 'int');
                    prevSize = stripeSize;
                }
            }

            groupBuffer.put(this.stripeCount, 'byte');

            this.setData(groupBuffer.flipWriter(), false);
        }

        this._encoded = true;
        return this._data;
    }

    public compress(versioned: boolean): ByteBuffer {
        this.encode();
        return this.data?.length ? super.compress(versioned) : null;
    }

    public readFiles(compress: boolean = false): void {
        if(!this.indexData) {
            this.generateIndexData();
        }

        const indexData = this._indexData;

        if(!indexData) {
            throw new Error(`Error reading group ${this.name} files: Group is not indexed, please re-index the ${this.archive.name} archive.`);
        }

        if(!this.indexData.files.size) {
            throw new Error(`Error reading group ${this.name} files: File group is empty or not loaded.`);
        }

        let fileNotFound = false;
        let childFileCount = 1;
        let isDirectory = false;

        const groupName = indexData.name;
        const groupPath = this.path;

        this._nameHash = indexData.nameHash ?? 0;
        this._name = indexData.name;
        this.crc32 = indexData.crc32;
        this.sha256 = indexData.sha256;
        this.compression = this.compression;
        this.stripeCount = indexData.stripeCount;

        if(this.archive.config.versioned) {
            this.version = indexData.version;
        }

        if(existsSync(groupPath) && statSync(groupPath).isDirectory()) {
            childFileCount = readdirSync(groupPath).length ?? 1;
            isDirectory = true;
        }

        if(indexData.files.size !== childFileCount) {
            this._modified = true;
        }

        if(!isDirectory) {
            const fileIndex = '0';
            const fileIndexData = indexData.files.get(fileIndex);
            const file = new File(fileIndex, this, fileIndexData);

            if(!file.readFlatFile()) {
                fileNotFound = true;
            }

            this.files.set(fileIndex, file);
        } else {
            for(const [ fileIndex, fileDetails ] of indexData.files) {
                const file = new File(fileIndex, this, fileDetails);

                if(!file.readGroupedFile()) {
                    fileNotFound = true;
                }

                this.files.set(fileIndex, file);
            }
        }

        this.encode();

        if(fileNotFound) {
            logger.error(`${groupName} was not found.`);
            return;
        }

        if(this.sha256 !== this.generateSha256()) {
            logger.warn(`Detected file changes for ${this.archive.name}/${groupName}`);
            this._modified = true;
        }

        if(compress) {
            this.compress(false);

            if(this.crc32 !== this.generateCrc32()) {
                logger.warn(`File ${this.name}/${groupName} CRC mismatch.`);
            }

            // this.appendVersionNumber();
        }

        this._loaded = true;
    }

    public appendVersionNumber(): void {
        if(this.archive.config.versioned) {
            const versionedData = new ByteBuffer((this._data.length + 2));
            this._data.copy(versionedData, 0, 0);
            versionedData.put(this.version ?? 1, 'short');
            this.setData(versionedData, true);
        }
    }

    public indexFiles(): void {

    }

    public generateIndexData(): GroupIndex {
        const { nameOrIndex: name, nameHash, size, crc32, sha256, version, stripeCount, files } = this;
        const fileMetadata = new Map<string, GroupIndex>();

        if(files.size) {
            for(const [ fileIndex, file ] of files) {
                fileMetadata.set(fileIndex, file.generateIndexData());
            }
        }

        this._indexData = {
            name, nameHash, size, crc32, sha256, version, stripeCount,
            files: fileMetadata
        };

        return this._indexData;
    }

    public createNewFileIndex(): string {
        if(this.files.size === 0) {
            return '0';
        }

        const fileIndices = Array.from(this.files.keys()).map(key => Number(key));
        return String(Math.max(...fileIndices) + 1);
    }

    public get path(): string {
        return join(this.archive.path, this.indexData?.name ?? '');
    }

    public get outputPath(): string {
        return join(this.archive.outputPath, this.indexData?.name ?? '');
    }

    public get encoded(): boolean {
        return this._encoded;
    }
}
