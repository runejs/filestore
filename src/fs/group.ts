import { join } from 'path';
import { existsSync, readdirSync, statSync, mkdirSync, rmSync } from 'graceful-fs';
import { ByteBuffer } from '@runejs/common/buffer';
import { logger } from '@runejs/common';
import { FileProperties } from './file-properties';
import { FlatFile } from './flat-file';
import { FileIndex } from './file-index';


export class Group extends FlatFile {

    public files: Map<string, FlatFile>;
    public fileSizes: Map<string, number>;

    private _fileCount: number;

    public constructor(index: string | number, properties?: Partial<FileProperties>) {
        super(index, properties);
        this.files = new Map<string, FlatFile>();
        this.fileSizes = new Map<string, number>();
        this._fileCount = 0;
    }

    public override js5Decode(): ByteBuffer | null {
        if(!this._js5Encoded) {
            return this._data ?? null;
        }

        if(!this._data?.length) {
            const js5File = this.store?.js5.extractFile(this.archive, this.key);
            this.setData(js5File.data, true);
        }

        this.encryption = this.archive.encryption ?? 'none';
        this.encrypted = (this.archive.encryption ?? 'none') !== 'none';

        if(this.compressed) {
            this.decompress();
        }

        this.generateSha256();

        if(this._fileCount === 1) {
            const flatFile: FlatFile = Array.from(this.files.values())[0];
            flatFile.key = '0';
            flatFile.name = this.name;
            flatFile.nameHash = this.nameHash;
            flatFile.sha256 = this.sha256;
            flatFile.crc32 = this.crc32;
            flatFile.encryption = this.encryption;
            flatFile.encrypted = this.encrypted;
            flatFile.setData(this._data, this.compressed);
        } else {
            const dataLength = this._data?.length ?? 0;

            if(!dataLength) {
                logger.error(`Error decoding group ${this.key}`);
                return;
            }

            this._data.readerIndex = (dataLength - 1); // EOF

            const stripeCount = this._data.get('byte', 'unsigned');

            this._data.readerIndex = (dataLength - 1 - stripeCount * this.files.size * 4); // Stripe data footer

            for(let stripe = 0; stripe < stripeCount; stripe++) {
                let currentLength = 0;
                for(const [ fileIndex, file ] of this.files) {
                    const delta = this._data.get('int');
                    currentLength += delta;

                    if(!file.stripes?.length) {
                        file.stripes = new Array(stripeCount);
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
                file.setData(new ByteBuffer(fileSize), false);
                file.size = fileSize;
            }

            this._data.readerIndex = 0;

            for(let stripe = 0; stripe < stripeCount; stripe++) {
                for(const [ , file ] of this.files) {
                    if(file.empty) {
                        continue;
                    }

                    let stripeLength = file.stripes[stripe];

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

        this._fileCount = this.files.size;
        this._js5Encoded = false;
        return this._data ?? null;
    }

    public override js5Encode(): ByteBuffer | null {
        if(this.js5Encoded) {
            return this._data;
        }

        // Single-file group
        if(this._fileCount === 1) {
            const flatFile = Array.from(this.files.values())[0];
            this.setData(flatFile.data ?? new ByteBuffer([]), false);
            this._js5Encoded = true;
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

        this.setData(groupBuffer.flipWriter(), false);

        this._js5Encoded = true;
        return this._data;
    }

    public override compress(): ByteBuffer | null {
        return super.compress();
    }

    public override read(compress: boolean = false): ByteBuffer | null {
        // @TODO re-index this automatically

        if(!this.index) {
            throw new Error(`Error reading group ${this.name} files: Group is not indexed, please re-index the ` +
                `${this.archive.name} archive.`);
        }

        let children = this.index.children;

        if(!children?.size) {
            // Set default single child file (which is excluded from the .index file to save on disk space)
            children = new Map<string, FileIndex>();
            const { name, nameHash, size, version, crc32, sha256, stripes } = this.index;
            children.set('0', {
                key: 0, name, nameHash, size, version, crc32, sha256, stripes
            });
        }

        let isDirectory = false;
        let childFileCount = 1;

        const groupName = this.index.name;
        const groupPath = this.path;

        if(this.archive.versioned) {
            this.version = this.index.version;
        }

        if(existsSync(groupPath) && statSync(groupPath).isDirectory()) {
            childFileCount = readdirSync(groupPath).length ?? 1;
            isDirectory = true;
        }

        if(children.size !== childFileCount) {
            this._modified = true;
        }

        this.files.clear();
        this.fileSizes.clear();

        // Load the group's files
        for(const [ fileIndex, fileIndexData ] of children) {
            const { name, nameHash, size, stripes, crc32, sha256 } = fileIndexData;
            const file = new FlatFile(fileIndex, {
                name, nameHash,
                group: this, archive: this.archive,
                size, stripes, crc32, sha256,
                index: fileIndexData
            });

            this.files.set(fileIndex, file);
            this.fileSizes.set(fileIndex, size);
        }

        this._fileCount = this.files.size;

        // Read the content of each file within the group
        Array.from(this.files.values()).forEach(file => file.read(compress));

        if(this._fileCount === 1) {
            // Single file group, set the group data to match the flat file data
            const file = this.files.get('0');
            this.setData(file.data, file.compressed);
        }

        this.js5Encode();

        const originalDigest = this.sha256;
        this.generateSha256();

        if(this.sha256 && originalDigest !== this.sha256) {
            logger.info(`Detected changes in file ${this.archive.name}:${groupName}.`);
            this.index.sha256 = this.sha256;
            this._modified = true;
        }

        if(compress) {
            this.compress();

            const originalCrc = this.crc32;

            if(originalCrc !== this.generateCrc32()) {
                if(!this._modified) {
                    logger.info(`Detected changes in file ${this.archive.name}:${groupName}.`);
                }
                this.index.crc32 = this.crc32;
                this._modified = true;
            }
        }

        this._loaded = true;
        return this._data;
    }

    public override write(): void {
        if(!this._fileCount) {
            logger.error(`Error writing group ${this.name || this.key}: Group is empty.`);
            return;
        }

        const groupPath = this.outputPath;

        if(existsSync(groupPath)) {
            rmSync(groupPath, { recursive: true, force: true });
        }

        if(this.files.size > 1) {
            mkdirSync(groupPath, { recursive: true });
        }

        Array.from(this.files.values()).forEach(file => file.write());
    }

    public override generateIndex(): FileIndex {
        const fileIndex = super.generateIndex();

        if(this._fileCount <= 1) {
            // Single file group
            return this.index;
        } else {
            // Multi file group
            const children = new Map<string, FileIndex>();

            for(const [ fileKey, file ] of this.files) {
                children.set(fileKey, file.generateIndex());
            }

            this.index = { ...fileIndex, children };

            return this.index;
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

        return join(archiveOutputPath, String(this.name || this.key));
    }

    public get fileCount(): number {
        return this._fileCount;
    }
}
