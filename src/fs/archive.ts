import { join } from 'path';
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'graceful-fs';
import { logger } from '@runejs/common';
import { ByteBuffer } from '@runejs/common/buffer';
import { ArchiveProperties, FileProperties, Group, FlatFile, FileIndex, FileError } from './index';
import { ArchiveIndexEntity } from '../db';
import { IndexedFile } from './indexed-file';


export class Archive extends IndexedFile<ArchiveIndexEntity> {

    public readonly config: ArchiveProperties;
    public readonly groups: Map<string, Group>;

    private _missingEncryptionKeys: number;

    public constructor(index: string | number, config: ArchiveProperties, properties?: Partial<FileProperties>) {
        super(index, properties);

        this.groups = new Map<string, Group>();

        config.filesNamed = config.filesNamed || false;
        config.versioned = config.versioned || false;
        config.format = config.format || 5;

        this.config = config;
        this.encryption = this.config.encryption || 'none';
        this.compression = this.config.compression || 'none';
    }

    public override js5Decode(decodeGroups: boolean = true): ByteBuffer | null {
        this._missingEncryptionKeys = 0;

        if(this.name) {
            this.nameHash = this.store.hashFileName(this.name);
        }

        logger.info(`Decoding archive ${this.name}...`);

        const js5File = super.js5Decode();
        this.setData(js5File, true);

        this.generateCrc32();

        logger.info(`Archive ${this.name ?? this.key} calculated checksum: ${this.crc32}`);

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

        if(filesNamed !== this.config.filesNamed) {
            logger.warn(`Archive file name flag mismatch; expected ${this.config.filesNamed} ` +
                `but received ${filesNamed}!`);
        }

        const groupIndices: number[] = new Array(fileCount);
        let accumulator = 0;

        for(let i = 0; i < fileCount; i++) {
            const delta = archiveData.get('short', 'unsigned');
            groupIndices[i] = accumulator += delta;
            const group = new Group(groupIndices[i], {
                name: String(groupIndices[i]),
                archive: this,
                encryption: this.encryption,
                encrypted,
                compression: this.compression,
                compressed: true
            });

            group.js5Encoded = true;

            this.set(groupIndices[i], group);
        }

        if(filesNamed) {
            for(const groupIndex of groupIndices) {
                const group = this.get(groupIndex);
                group.nameHash = archiveData.get('int');
                group.name = this.store.findFileName(group.nameHash, String(group.nameHash));
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
                    group: group,
                    name: String(childFileIndex)
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
                        childFile.name = this.store.findFileName(childFile.nameHash, String(childFile.nameHash));
                    }
                }
            }
        }

        if(decodeGroups) {
            let successes = 0;
            let failures = 0;

            for(const [ , group ] of this.groups) {
                try {
                    (group as Group).js5Decode();

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

        if(!this.groups.size) {
            this.read(true);
        }

        const groups = this.groups;
        const groupCount = groups.size;

        // @TODO add sizes of all files instead of using a set amount here
        const buffer = new ByteBuffer(1000 * 1000);

        // Write index file header
        buffer.put(this.config.format ?? 5); // '5' for 'JS5' by default
        buffer.put(this.config.filesNamed ? 1 : 0);
        buffer.put(groupCount, 'short');

        // Write file indexes
        let writtenFileIndex = 0;
        for(const [ , group ] of groups) {
            const val = group.numericKey;
            buffer.put(val - writtenFileIndex, 'short');
            writtenFileIndex = val;
        }

        // Write name hashes (if applicable)
        if(this.config.filesNamed) {
            for(const [ , file ] of groups) {
                buffer.put(file.nameHash ?? -1, 'int');
            }
        }

        // Write file crc values
        for(const [ , file ] of groups) {
            buffer.put(file.crc32 ?? -1, 'int');
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
        if(this.config.filesNamed) {
            for(const [ , group ] of groups) {
                if(group instanceof Group && group.files.size > 1) {
                    for(const [ , file ] of group.files) {
                        buffer.put(file.nameHash ?? -1, 'int');
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
                this.index.sha256 = this.sha256;
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

    public override async read(compress: boolean = false): Promise<ByteBuffer | null> {
        if(this._loaded) {
            return this._data;
        }

        logger.info(`Reading archive ${this.name}...`);

        this._loaded = true;
        this._index = await this.store.indexService.getArchiveIndex(this);

        console.log(JSON.stringify(this._index, null, 2));

        this.crc32 = this.index.crc32;
        this.sha256 = this.index.sha256;

        // Read in all groups within the archive
        const groups = this.index.groups;
        for(const groupIndex of groups) {
            const { name, nameHash, version, size, stripeCount, crc32, sha256 } = groupIndex;
            const group = new Group(groupIndex.key, {
                archive: this,
                name, nameHash, version, size, stripeCount, crc32, sha256,
                compression: this.config.compression,
                compressed: false,
                encryption: this.config.encryption,
                encrypted: false
            });

            this.groups.set(group.key, group);
            group.read(false);
        }

        if(compress) {
            // Then compress them, if needed
            for(const [ , group ] of this.groups) {
                group.compress();
            }
        }

        this.js5Encode(compress);

        logger.info(`${this.groups.size} file(s) were loaded from the ${this.name} archive.`);

        return new ByteBuffer([]); // @TODO
    }

    public override write(): void {
        if(!this.groups.size) {
            logger.error(`Error writing archive ${this.name || this.key}: Archive is empty.`);
            return;
        }

        const start = Date.now();
        logger.info(`Writing archive ${this.name || this.key}...`);

        const archivePath = this.outputPath;

        if(existsSync(archivePath)) {
            rmSync(archivePath, { recursive: true, force: true });
        }

        mkdirSync(archivePath, { recursive: true });

        Array.from(this.groups.values()).forEach(group => group.write());

        const end = Date.now();
        logger.info(`Archive ${this.name || this.key} written in ${(end - start) / 1000} seconds.`)
    }

    public override async verify(): Promise<void> {
        super.verify();
        this._index = await this.store.indexService.createArchiveIndex(this);

        for(const [ , group ] of this.groups) {
            await group.verify();
        }
    }

    public async saveIndexData(): Promise<void> {
        await this.verify();

        await this.store.indexService.saveArchiveIndex(this.index);

        const groups = Array.from(this.groups.values());

        const groupIndexes = groups.map(group => group.index);
        await this.store.indexService.saveGroupIndexes(groupIndexes);

        const flatFiles = groups.filter(group => group.files.size > 1).map(group => Array.from(group.files.values())
            .map(file => file.index)).reduce((a, v) => a.concat(v), []);
        await this.store.indexService.saveFileIndexes(flatFiles);
    }

    public has(childIndex: string | number): boolean {
        return this.groups.has(String(childIndex));
    }

    public get(childIndex: string | number): Archive | Group | FlatFile | null {
        return this.groups.get(String(childIndex)) ?? null;
    }

    public set(childIndex: string | number, group: Group): void {
        this.groups.set(String(childIndex), group);
    }

    public find(fileName: string): Archive | Group | FlatFile | null {
        const children = Array.from(this.groups.values());
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
            throw new Error(`Error generating archive path; Store path not provided for archive ${this.key}.`);
        }
        if(!this.name) {
            throw new Error(`Error generating archive path; Name not provided for archive ${this.key}.`);
        }

        return join(this.store.path, 'archives', this.name);
    }

    public override get outputPath(): string {
        if(!this.store?.outputPath) {
            throw new Error(`Error generating archive output path; Store output path not provided for archive ${this.key}.`);
        }
        if(!this.name) {
            throw new Error(`Error generating archive output path; Name not provided for archive ${this.key}.`);
        }

        return join(this.store.outputPath, this.name);
    }

    public get versioned(): boolean {
        return this.config.versioned;
    }

}
