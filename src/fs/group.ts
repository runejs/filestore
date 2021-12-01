import { join } from 'path';
import { existsSync, readdirSync, statSync } from 'graceful-fs';
import { ByteBuffer } from '@runejs/common/buffer';
import { FileProperties } from './file-properties';
import { FlatFile } from './flat-file';
import { GroupIndex } from './file-index';
import { logger } from '@runejs/common';
import { mkdirSync, rmSync } from 'fs';


export class Group extends FlatFile<GroupIndex> {

    public files: Map<string, FlatFile>;
    public fileSizes: Map<string, number>;

    public constructor(index: string | number, properties?: Partial<FileProperties<GroupIndex>>) {
        super(index, properties);
        this.files = new Map<string, FlatFile>();
        this.fileSizes = new Map<string, number>();
    }

    public override js5Decode(): ByteBuffer | null {
        if(!this._js5Encoded) {
            return this._data ?? null;
        }

        if(!this._data?.length) {
            const js5File = this.store?.js5.extractFile(this.archive, this.fileKey);
            this.setData(js5File.data, true);
        }

        this.encryption = this.archive.encryption ?? 'none';
        this.encrypted = (this.archive.encryption ?? 'none') !== 'none';

        if(this.compressed) {
            this.decompress();
        }

        this.generateSha256();

        if(this.files.size === 1) {
            const flatFile: FlatFile = Array.from(this.files.values())[0];
            flatFile.fileKey = '0';
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
                logger.error(`Error decoding group ${this.fileKey}`);
                return;
            }

            this._data.readerIndex = (dataLength - 1); // EOF

            this.stripeCount = this._data.get('byte', 'unsigned');

            this.fileSizes.clear();

            this._data.readerIndex = (dataLength - 1 - this.stripeCount * this.files.size * 4); // Stripe data footer

            for(let stripe = 0; stripe < this.stripeCount; stripe++) {
                let currentLength = 0;
                for(const [ fileIndex, file ] of this.files) {
                    const delta = this._data.get('int');
                    currentLength += delta;

                    if(!file.stripeSizes?.length) {
                        file.stripeSizes = new Array(this.stripeCount);
                    }

                    let size = 0;
                    if(!this.fileSizes.has(fileIndex)) {
                        this.fileSizes.set(fileIndex, 0);
                    } else {
                        size = this.fileSizes.get(fileIndex);
                    }

                    file.stripeSizes[stripe] = currentLength;
                    this.fileSizes.set(fileIndex, size + currentLength);
                }
            }

            for(const [ fileIndex, file ] of this.files) {
                const fileSize = this.fileSizes.get(fileIndex) || 0;
                file.setData(new ByteBuffer(fileSize), false);
                file.size = fileSize;
            }

            this._data.readerIndex = 0;

            for(let stripe = 0; stripe < this.stripeCount; stripe++) {
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

        this._js5Encoded = false;
        return this._data ?? null;
    }

    public override js5Encode(): ByteBuffer | null {
        if(this.js5Encoded) {
            return this._data;
        }

        // Single-file group
        if(this.files.size === 1) {
            const flatFile = Array.from(this.files.values())[0];
            this.setData(flatFile.data ?? new ByteBuffer([]), false);
            this._js5Encoded = true;
            return this._data;
        }

        // Multi-file group
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

        this._js5Encoded = true;
        return this._data;
    }

    public override compress(): ByteBuffer | null {
        return super.compress();
    }

    public override read(compress: boolean = false): ByteBuffer | null {
        const indexData = this.fileIndex;

        if(!indexData) {
            throw new Error(`Error reading group ${this.name} files: Group is not indexed, please re-index the ` +
                `${this.archive.name} archive.`);
        }

        if(!this.fileIndex.files.size) {
            throw new Error(`Error reading group ${this.name} files: File group is empty or not loaded.`);
        }

        let fileNotFound = false;
        let isDirectory = false;
        let childFileCount = 1;

        const groupName = indexData.name;
        const groupPath = this.path;

        if(this.archive.versioned) {
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
            const file = new FlatFile(fileIndex, {
                group: this, archive: this.archive,
                fileIndex: fileIndexData
            });

            this.files.set(fileIndex, file);

            if(!file.read(compress)) {
                fileNotFound = true;
            } else {
                this.setData(file.data, file.compressed);
            }
        } else {
            for(const [ fileIndex, fileIndexData ] of indexData.files) {
                const { size, stripeCount, stripeSizes, crc32, sha256 } = fileIndexData;
                const file = new FlatFile(fileIndex, {
                    group: this, archive: this.archive,
                    size, stripeSizes, stripeCount, crc32, sha256,
                    fileIndex: fileIndexData
                });

                this.files.set(fileIndex, file);

                file.read(compress);
            }
        }

        this.js5Encode();

        if(fileNotFound) {
            return null;
        }

        const originalDigest = this.sha256;
        this.generateSha256();

        if(!this.sha256) {
            logger.error(`File ${this.archive.name}/${groupName} was not loaded.`);
        } else if(originalDigest !== this.sha256) {
            logger.warn(`File ${this.archive.name}/${groupName} digest has changed:`,
                `Orig: ${originalDigest}`, `New:  ${this.sha256}`);
            this.fileIndex.sha256 = this.sha256;
            this._modified = true;
        }

        if(compress) {
            this.compress();

            const originalCrc = this.crc32;

            if(originalCrc !== this.generateCrc32()) {
                // logger.warn(`File ${this.archive.name}/${groupName} checksum has changed from ${originalCrc} ` +
                //     `to ${this.crc32}.`);
                this.fileIndex.crc32 = this.crc32;
                this._modified = true;
            }

            if(this.archive.versioned) {
                // this.appendVersionNumber();
            }
        }

        this._loaded = true;
        return this._data;
    }

    public override write(): void {
        if(!this.files.size) {
            logger.error(`Error writing group ${this.name || this.fileKey}: Group is empty.`);
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

    public has(fileIndex: string | number): boolean {
        return this.files.has(String(fileIndex));
    }

    public get(fileIndex: string | number): FlatFile | null {
        return this.files.get(String(fileIndex)) ?? null;
    }

    public set(fileIndex: string | number, file: FlatFile): void {
        this.files.set(String(fileIndex), file);
    }

    public override get path(): string {
        const archivePath = this.archive?.path || null;
        if(!archivePath) {
            throw new Error(`Error generating group path; Archive path not provided to group ${this.fileKey}.`);
        }

        return join(archivePath, this.name || this.fileKey);
    }

    public override get outputPath(): string {
        const archiveOutputPath = this.archive?.outputPath || null;
        if(!archiveOutputPath) {
            throw new Error(`Error generating group output path; Archive output path not provided to group ${this.fileKey}.`);
        }

        return join(archiveOutputPath, this.name || this.fileKey);
    }

}
