import { join } from 'path';
import { logger } from '@runejs/common';
import { ByteBuffer } from '@runejs/common/buffer';
import { ArchiveProperties, ArchiveIndex, FileProperties, Group, FlatFile, readArchiveIndexFile } from './index';


export class Archive extends FlatFile<ArchiveIndex> {

    public readonly config: ArchiveProperties;
    public readonly children: Map<string, Archive | Group | FlatFile>;

    private _missingEncryptionKeys: number;

    public constructor(index: string | number, properties?: Partial<FileProperties<ArchiveIndex>>) {
        super(index, properties);

        this.children = new Map<string, Archive | Group | FlatFile>();

        if(this.numericKey !== 255) {
            this.config = this.store.archiveConfig[this.name];
            this.encryption = this.config.encryption ?? 'none';
            this.compression = this.config.compression ?? 'none';
        }
    }

    public override js5Decode(decodeGroups: boolean = true): ByteBuffer | null {
        this._missingEncryptionKeys = 0;
        this.name = this.config.name;
        this.nameHash = this.store.hashFileName(this.name);

        if(this.numericKey === 255) {
            return null;
        }

        logger.info(`Decoding archive ${this.name}...`);

        const js5File = this.store.js5.extractFile(this.archive, this.fileKey);
        this.setData(js5File.data, true);
        this.fileIndex.stripeCount = js5File.properties.stripeCount;

        this.generateCrc32();

        logger.info(`Archive ${this.name ?? this.fileKey} calculated checksum: ${this.crc32}`);

        const archiveData = this.decompress();

        this.generateSha256();

        if(!archiveData?.length) {
            logger.error(`Error decompressing file data.`);
            return null;
        }

        const encrypted = this.encryption !== 'none';

        const format = archiveData.get('byte', 'unsigned');
        const filesNamed = (archiveData.get('byte', 'unsigned') & 0x01) !== 0;
        const fileCount = archiveData.get('short', 'unsigned');

        if(format !== this.config.format) {
            logger.warn(`Archive format mismatch; expected ${this.config.format} but received ${format}!`);
        }

        if(filesNamed !== this.config.saveFileNames) {
            logger.warn(`Archive file name flag mismatch; expected ${this.config.saveFileNames} ` +
                `but received ${filesNamed}!`);
        }

        const groupIndices: number[] = new Array(fileCount);
        let accumulator = 0;

        for(let i = 0; i < fileCount; i++) {
            const delta = archiveData.get('short', 'unsigned');
            groupIndices[i] = accumulator += delta;
            this.set(groupIndices[i], new Group(groupIndices[i], {
                archive: this,
                encryption: this.encryption,
                encrypted,
                compression: this.compression,
                compressed: true
                // @TODO fileIndex
            }));
        }

        if(filesNamed) {
            for(const groupIndex of groupIndices) {
                this.get(groupIndex).nameHash = archiveData.get('int');
            }
        }

        /* read the crc values */
        for(const groupIndex of groupIndices) {
            this.get(groupIndex).crc32 = archiveData.get('int');
        }

        /* read the version numbers */
        for(const groupIndex of groupIndices) {
            this.get(groupIndex).version = archiveData.get('int');
        }

        /* read the child count */
        const groupChildCounts: Map<number, number> = new Map<number, number>();

        for(const groupIndex of groupIndices) {
            // group file count
            groupChildCounts.set(groupIndex, archiveData.get('short', 'unsigned'));
        }

        /* read the file groupIndices */
        for(const groupIndex of groupIndices) {
            const group = this.get(groupIndex) as Group;
            const fileCount = groupChildCounts.get(groupIndex);

            accumulator = 0;
            for(let i = 0; i < fileCount; i++) {
                const delta = archiveData.get('short', 'unsigned');
                const childFileIndex = accumulator += delta;
                group.set(childFileIndex, new FlatFile(childFileIndex, {
                    archive: this,
                    group: group
                    // @TODO fileIndex
                }));
            }
        }

        /* read the child name hashes */
        if(filesNamed) {
            for(const groupIndex of groupIndices) {
                const fileGroup = this.get(groupIndex) as Group;

                for(const [ , childFile ] of fileGroup.files) {
                    const nameHash = archiveData.get('int');
                    if(childFile) {
                        childFile.nameHash = nameHash;
                    }
                }
            }
        }

        if(decodeGroups) {
            let successes = 0;
            let failures = 0;

            for(const [ , group ] of this.children) {
                try {
                    group.js5Decode();

                    if(group.data?.length && !group.compressed) {
                        successes++;
                    } else {
                        failures++;
                    }
                } catch(error) {
                    logger.error(error);
                    failures++;
                }
            }

            if(successes) {
                logger.info(`${fileCount} file(s) were found, ` +
                    `${successes} decompressed successfully.`);
            } else {
                logger.info(`${fileCount} file(s) were found.`);
            }

            if(failures) {
                logger.error(`${failures} file(s) failed to decompress.`);
            }

            if(this.missingEncryptionKeys) {
                logger.error(`Missing ${this.missingEncryptionKeys} XTEA decryption key(s).`);
            }
        } else {
            logger.info(`${fileCount} file(s) were found.`);
        }

        return this._data ?? null;
    }

    public override js5Encode(compress: boolean = true): ByteBuffer | null {
        if(!this.empty && (this.compressed || this.compression === 'none')) {
            return this.data;
        }

        if(this.numericKey === 255) {
            return this.store.js5Encode();
        }

        if(!this.children.size) {
            this.read(true);
        }

        const groups = this.children;
        const groupCount = groups.size;

        // @TODO add sizes of all files instead of using a set amount here
        const buffer = new ByteBuffer(1000 * 1000);

        // Write index file header
        buffer.put(this.config.format ?? 5); // '5' for 'JS5' by default
        buffer.put(this.config.saveFileNames ? 1 : 0);
        buffer.put(groupCount, 'short');

        // Write file indexes
        let writtenFileIndex = 0;
        for(const [ , group ] of groups) {
            const val = group.numericKey;
            buffer.put(val - writtenFileIndex, 'short');
            writtenFileIndex = val;
        }

        // Write name hashes (if applicable)
        if(this.config.saveFileNames) {
            for(const [ , file ] of groups) {
                buffer.put(file.nameHash ?? 0, 'int');
            }
        }

        // Write file crc values
        for(const [ , file ] of groups) {
            buffer.put(file.crc32 ?? 0, 'int');
        }

        // Write file version numbers
        for(const [ , file ] of groups) {
            buffer.put(0, 'int');
        }

        // Write file group child counts
        for(const [ , group ] of groups) {
            buffer.put((group instanceof Group) ? (group.files.size ?? 1) : 1, 'short');
        }

        // Write group file indices
        for(const [ , group ] of groups) {
            if(group instanceof Group && group.files.size > 1) {
                writtenFileIndex = 0;

                for(const [ , file ] of group.files) {
                    const i = file.numericKey;
                    buffer.put(i - writtenFileIndex, 'short');
                    writtenFileIndex = i;
                }
            } else {
                buffer.put(0, 'short');
            }
        }

        // Write group file name hashes (if applicable)
        if(this.config.saveFileNames) {
            for(const [ , group ] of groups) {
                if(group instanceof Group && group.files.size > 1) {
                    for(const [ , file ] of group.files) {
                        buffer.put(file.nameHash ?? 0, 'int');
                    }
                } else {
                    buffer.put(0, 'int');
                }
            }
        }

        const indexData = buffer.flipWriter();
        const indexDigest = this.sha256;

        if(indexData.length) {
            this.setData(indexData, false);
            this.generateSha256();

            if(indexDigest !== this.sha256) {
                // logger.warn(`Archive ${this.name} digest has changed:`, `Orig: ${indexDigest}`, `New:  ${this.sha256}`);
                this.fileIndex.sha256 = this.sha256;
            }

            if(compress) {
                this.compress();
            }

            return this._data;
        }

        return null;
    }

    public override compress(): ByteBuffer | null {
        if(this.empty) {
            this.js5Encode(false);
        }

        return super.compress();
    }

    public override read(compress: boolean = false): ByteBuffer | null {
        if(this.children.size > 0) {
            logger.warn(`Archive ${this.name} has already been read, please use reload() to re-read the archive's contents.`);
            return null;
        }

        logger.info(`Reading archive ${this.name}...`);

        this.fileIndex = readArchiveIndexFile(this.path);
        this.crc32 = this.fileIndex.crc32;
        this.sha256 = this.fileIndex.sha256;

        // Read in all groups within the archive
        for(const [ groupIndex, groupDetails ] of this.fileIndex.groups) {
            const { name, nameHash, version, size, stripeCount, stripeSizes, crc32, sha256 } = groupDetails;
            const group = new Group(groupIndex, {
                archive: this,
                name, nameHash, version, size, stripeCount, stripeSizes, crc32, sha256,
                compression: this.config.compression,
                compressed: false,
                encryption: this.config.encryption,
                encrypted: false,
                fileIndex: groupDetails
            });
            this.children.set(groupIndex, group);
            group.read(false);
        }

        if(compress) {
            // Then compress them, if needed
            for(const [ , group ] of this.children) {
                group.compress();
            }
        }

        this.js5Encode(compress);

        logger.info(`${this.children.size} file(s) were loaded from the ${this.name} archive.`);
        this._loaded = true;
    }

    public reload(compress: boolean = false): void {
        this.children.clear();
        this.read(compress);
    }

    public has(childIndex: string | number): boolean {
        return this.children.has(String(childIndex));
    }

    public get(childIndex: string | number): Archive | Group | FlatFile | null {
        return this.children.get(String(childIndex)) ?? null;
    }

    public set(archiveIndex: string | number, archive: Archive): void;
    public set(groupIndex: string | number, group: Group): void;
    public set(fileIndex: string | number, file: FlatFile): void;
    public set(childIndex: string | number, child: Archive | Group | FlatFile): void;
    public set(childIndex: string | number, child: Archive | Group | FlatFile): void {
        this.children.set(String(childIndex), child);
    }

    public find(fileName: string): Archive | Group | FlatFile | null {
        const children = Array.from(this.children.values());
        return children.find(child => child?.name === fileName) ?? null;
    }

    public incrementMissingEncryptionKeys(): void {
        this._missingEncryptionKeys++;
    }

    public get missingEncryptionKeys(): number {
        return this._missingEncryptionKeys;
    }

    public override get path(): string {
        if(!this.store?.path) {
            throw new Error(`Error generating archive path; Store path not provided for archive ${this.fileKey}.`);
        }
        if(!this.name) {
            throw new Error(`Error generating archive path; Name not provided for archive ${this.fileKey}.`);
        }

        return join(this.store.path, 'archives', this.name);
    }

    public get versioned(): boolean {
        return this.config.versioned;
    }

}
