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
        } else {
            this.setData(this.files.get('0')?.data ?? new ByteBuffer([]), false);
        }

        this._encoded = true;
        return this._data;
    }

    public override compress(): ByteBuffer {
        this.encode();
        return this.data?.length ? super.compress() : null;
    }

    public readFiles(compress: boolean = false): boolean {
        if(!this.indexData) {
            this.generateIndexData();
        }

        const indexData = this._indexData;

        if(!indexData) {
            throw new Error(`Error reading group ${this.name} files: Group is not indexed, please re-index the ` +
                `${this.archive.name} archive.`);
        }

        if(!this.indexData.files.size) {
            throw new Error(`Error reading group ${this.name} files: File group is empty or not loaded.`);
        }

        let fileNotFound = false;
        let isDirectory = false;
        let childFileCount = 1;

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

            if(!file.readFileData()) {
                fileNotFound = true;
            }

            this.files.set(fileIndex, file);
        } else {
            for(const [ fileIndex, fileDetails ] of indexData.files) {
                const file = new File(fileIndex, this, fileDetails);
                this.files.set(fileIndex, file);
                file.readFileData();
            }
        }

        this.encode();

        if(fileNotFound) {
            return false;
        }

        const originalDigest = this.sha256;
        this.generateSha256();

        if(!this.sha256) {
            logger.error(`File ${this.archive.name}/${groupName} was not loaded.`);
        } else if(originalDigest !== this.sha256) {
            logger.warn(`File ${this.archive.name}/${groupName} digest has changed:`,
                `Orig: ${originalDigest}`, `New:  ${this.sha256}`);
            this.indexData.sha256 = this.sha256;
            this._modified = true;
        }

        if(compress) {
            this.compress();

            const originalCrc = this.crc32;

            if(originalCrc !== this.generateCrc32()) {
                // logger.warn(`File ${this.archive.name}/${groupName} checksum has changed from ${originalCrc} ` +
                //     `to ${this.crc32}.`);
                this.indexData.crc32 = this.crc32;
                this._modified = true;
            }

            if(this.archive.config.versioned) {
                // this.appendVersionNumber();
            }
        }

        this._loaded = true;
        return true;
    }

    public appendVersionNumber(): void {
        const versionedData = new ByteBuffer((this._data.length + 2));
        this._data.copy(versionedData, 0, 0);
        versionedData.put(this.version ?? 1, 'short');
        this.setData(versionedData, true);
    }

    /**
     * Builds a transportation packet from the group file data, used by the update server to send files to the game client
     * while including the file's archive index and file index.
     */
    public wrap(): Buffer {
        if(!this.compressed) {
            this.compress();
        }

        let data = this.data;

        if(this.archive.config.versioned) {
            data = new ByteBuffer((this._data.length + 2));
            this._data.copy(data, 0, 0);
            data.put(this.version ?? 1, 'short');
        }

        const compression: number = data.get('byte', 'unsigned');
        const length: number = data.get('int', 'unsigned') + (compression === 0 ? 5 : 9);

        let buffer: ByteBuffer;

        try {
            buffer = new ByteBuffer((length - 2) + ((length - 2) / 511) + 8);
        } catch(error) {
            logger.error(`Invalid file length of ${length} detected.`);
            return null;
        }

        buffer.put(this.archive.numericIndex);
        buffer.put(this.numericIndex, 'short');

        let s = 3;
        for(let i = 0; i < length; i++) {
            if(s === 512) {
                buffer.put(255);
                s = 1;
            }

            buffer.put(data.at(i));
            s++;
        }

        return buffer.flipWriter().toNodeBuffer();
    }

    public indexFiles(): void {
        // @TODO
    }

    public override generateIndexData(): GroupIndex {
        const { nameOrIndex: name, nameHash, size, crc32, sha256, version, stripeCount, files } = this;
        const fileMetadata = new Map<string, GroupIndex>();

        if(files.size) {
            for(const [ fileIndex, file ] of files) {
                fileMetadata.set(fileIndex, file.generateIndexData());
            }
        }

        this._indexData = {
            name,
            nameHash,
            size,
            crc32,
            sha256,
            version,
            stripeCount,
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

    public override get path(): string {
        return join(this.archive.path, this.indexData?.name ?? '');
    }

    public override get outputPath(): string {
        return join(this.archive.outputPath, this.indexData?.name ?? '');
    }

    public get encoded(): boolean {
        return this._encoded;
    }
}
