import { join } from 'path';
import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'graceful-fs';
import { ByteBuffer, logger } from '@runejs/common';

import { FlatFile } from './flat-file';
import { GroupIndexEntity } from './db';
import { FileBreadcrumb, IndexedFile } from './indexed-file';
import { FileState } from './file-state';
import { isSet } from './util';


export class Group extends IndexedFile<GroupIndexEntity> {

    public readonly files: Map<string, FlatFile> = new Map<string, FlatFile>();
    public readonly fileSizes: Map<string, number> = new Map<string, number>();

    public stripes: number[] = [];
    public stripeCount: number = 1;

    private _fileCount: number = 0;

    public constructor(index: GroupIndexEntity, breadcrumb?: Partial<FileBreadcrumb>) {
        super(index, breadcrumb);

        if(isSet(index.stripes)) {
            this.stripes = index.stripes.split(',').map(n => Number(n));
        }
        if(isSet(index.stripeCount)) {
            this.stripeCount = index.stripeCount;
        }
        if(isSet(index.version)) {
            this.version = index.version;
        }
        if(isSet(index.nameHash)) {
            this.nameHash = index.nameHash;
        }

        if(this.archive.config.groupNames) {
            const nameEntries = Object.entries(this.archive.config.groupNames);
            const namedEntry = nameEntries.find(entry => entry[1] === this.numericKey) || null;
            if(namedEntry) {
                this.name = namedEntry[0];
            }
        }
    }

    public override decode(): ByteBuffer | null {
        this.unpack();
        this.decompress();

        if(this._fileCount === 1) {
            const flatFile: FlatFile = Array.from(this.files.values())[0];
            flatFile.name = this.name;
            flatFile.nameHash = this.nameHash;
            flatFile.sha256 = this.sha256;
            flatFile.crc32 = this.crc32;
            flatFile.encryption = this.encryption;
            flatFile.setData(this._data, this.state);
        } else {
            const dataLength = this._data?.length || 0;

            if(!dataLength || dataLength <= 0) {
                logger.error(`Error decoding group ${this.key}`);
                return null;
            }

            this._data.readerIndex = (dataLength - 1); // EOF

            this.stripeCount = this._data.get('byte', 'unsigned');

            this._data.readerIndex = (dataLength - 1 - this.stripeCount * this.files.size * 4); // Stripe data footer

            if(this._data.readerIndex < 0) {
                logger.error(`Invalid reader index of ${this._data.readerIndex} for group ${this.archive.name}:${this.key}.`);
                return null;
            }

            for(let stripe = 0; stripe < this.stripeCount; stripe++) {
                let currentLength = 0;
                for(const [ fileIndex, file ] of this.files) {
                    const delta = this._data.get('int');
                    currentLength += delta;

                    if(!file.stripes?.length) {
                        file.stripes = new Array(this.stripeCount);
                    }

                    let size = 0;
                    if(!this.fileSizes.has(fileIndex)) {
                        this.fileSizes.set(fileIndex, 0);
                    } else {
                        size = this.fileSizes.get(fileIndex);
                    }

                    file.stripes[stripe] = currentLength;
                    this.fileSizes.set(fileIndex, size + currentLength);
                }
            }

            for(const [ fileIndex, file ] of this.files) {
                const fileSize = this.fileSizes.get(fileIndex) || 0;
                file.setData(new ByteBuffer(fileSize), FileState.raw);
                file.size = fileSize;
            }

            this._data.readerIndex = 0;

            for(let stripe = 0; stripe < this.stripeCount; stripe++) {
                for(const [ , file ] of this.files) {
                    let stripeLength = file.stripes[stripe];
                    let sourceEnd: number = this._data.readerIndex + stripeLength;

                    if(this._data.readerIndex + stripeLength >= this._data.length) {
                        sourceEnd = this._data.length;
                        stripeLength = (this._data.readerIndex + stripeLength) - this._data.length;
                    }

                    const stripeData = this._data.getSlice(this._data.readerIndex, stripeLength);

                    file.data.putBytes(stripeData);

                    this._data.readerIndex = sourceEnd;
                }
            }

            this.files.forEach(file => file.generateSha256());
        }

        this.setData(this._data, FileState.raw);
        this._fileCount = this.files.size;
        return this._data ?? null;
    }

    public override encode(): ByteBuffer | null {
        // Single-file group
        if(this._fileCount === 1) {
            const flatFile = Array.from(this.files.values())[0];
            this.setData(flatFile.data ?? new ByteBuffer([]), FileState.encoded);
            return this._data;
        }

        // Multi-file group
        const fileData: ByteBuffer[] = Array.from(this.files.values()).map(file => file?.data ?? new ByteBuffer(0));
        const fileSizes = fileData.map(data => data.length);
        const fileCount = this._fileCount;
        const stripeCount = this.stripes?.length ?? 1;

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
                if(!file?.data?.length) {
                    continue;
                }

                const stripeSize = file.stripes[stripe];

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
                if(!file?.data?.length) {
                    continue;
                }

                const stripeSize = file.stripes[stripe] ?? 0;
                groupBuffer.put(stripeSize - prevSize, 'int');
                prevSize = stripeSize;
            }
        }

        groupBuffer.put(this.stripes?.length ?? 1, 'byte');

        this.setData(groupBuffer.flipWriter(), FileState.encoded);
        return this._data;
    }

    public override async read(compress: boolean = false, readDiskFiles: boolean = true): Promise<ByteBuffer | null> {
        if(!this.index) {
            logger.error(`Error reading group ${this.name} files: Group is not indexed, please re-index the ` +
                `${this.archive.name} archive.`);
            return null;
        }

        if(this.index.data?.length) {
            this.setData(this.index.data, FileState.compressed);
        }

        let indexedFiles = await this.index.files;

        if(!indexedFiles?.length) {
            // Single file indexes are not stored to save on DB space and read/write times
            // So if a group has no children, assume it is a single-file group and create a single index for it
            const { name, nameHash, version, size, crc32, sha256, stripes, stripeCount, archive, state } = this;
            indexedFiles = this.index.files = [ this.indexService.validateFile({
                numericKey: 0, name, nameHash, version, size, crc32, sha256, stripes, stripeCount,
                group: this, archive
            }) ];
        }

        let childFileCount = 1;

        const groupPath = this.path;

        if(this.archive.versioned) {
            this.version = this.index.version;
        }

        if(existsSync(groupPath) && statSync(groupPath).isDirectory()) {
            childFileCount = readdirSync(groupPath).length ?? 1;
        }

        if(indexedFiles.length !== childFileCount) {
            this._modified = true;
        }

        this._fileCount = childFileCount;

        this.files.clear();
        this.fileSizes.clear();

        // Load the group's files
        for(const fileIndexData of indexedFiles) {
            const file = new FlatFile(fileIndexData, {
                group: this, archive: this.archive, store: this.store
            });

            this.files.set(file.key, file);
            this.fileSizes.set(file.key, fileIndexData.size);
        }

        this.stripeCount = (this.index as GroupIndexEntity).stripeCount || 1;

        // Read the content of each file within the group
        if(readDiskFiles) {
            Array.from(this.files.values()).forEach(file => file.read(compress));

            if(this._fileCount === 1) {
                // Single file group, set the group data to match the flat file data
                const file = this.files.get('0');
                this.setData(file.data, file.state);
            }
        }

        this.encode();

        const originalDigest = this.sha256;
        this.generateSha256();

        if(this.sha256 && originalDigest !== this.sha256) {
            // logger.info(`Detected changes in file ${this.archive.name}:${groupName}.`);
            this.index.sha256 = this.sha256;
            this._modified = true;
        }

        if(compress && this.state !== FileState.compressed) {
            this.compress();
        }

        return this._data;
    }

    public override write(): void {
        if(!this._fileCount) {
            logger.error(`Error writing group ${this.name}: Group is empty.`);
            return;
        }

        // logger.info(`Writing group ${this.name}...`);

        const groupPath = this.outputPath;

        if(existsSync(groupPath)) {
            rmSync(groupPath, { recursive: true, force: true });
        }

        if(this.files.size > 1 && !this.archive.config.flatten) {
            mkdirSync(groupPath, { recursive: true });
        }

        if(!this.archive.config.flatten) {
            Array.from(this.files.values()).forEach(file => file.write());
        } else {
            super.write();
        }
    }

    public has(fileIndex: string | number): boolean {
        return this.files.has(String(fileIndex));
    }

    public get(fileIndex: string | number): FlatFile | null {
        return this.files.get(String(fileIndex)) ?? null;
    }

    public set(fileIndex: string | number, file: FlatFile): void {
        this.files.set(String(fileIndex), file);
        this._fileCount = this.files.size;
    }

    public override get path(): string {
        const archivePath = this.archive?.path || null;
        if(!archivePath) {
            throw new Error(`Error generating group path; Archive path not provided to group ${this.key}.`);
        }

        return join(archivePath, String(this.name || this.key));
    }

    public override get outputPath(): string {
        const archiveOutputPath = this.archive?.outputPath || null;
        if(!archiveOutputPath) {
            throw new Error(`Error generating group output path; Archive output path not provided to group ${this.key}.`);
        }

        const groupPath = join(archiveOutputPath, String(this.name || this.key));
        return this.archive.config.flatten ? groupPath + this.type : groupPath;
    }

    public get fileCount(): number {
        return this._fileCount;
    }

    public get type(): string {
        return this.archive?.config?.contentType ?? '';
    }
}
