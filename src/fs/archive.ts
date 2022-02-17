import { join } from 'path';
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'graceful-fs';
import { logger } from '@runejs/common';
import { ByteBuffer } from '@runejs/common/buffer';
import { Group, FlatFile } from './index';
import { ArchiveIndexEntity } from '../db';
import { AdditionalFileProperties, IndexedFile } from './indexed-file';
import { ArchiveConfig } from '../config';


export class Archive extends IndexedFile<ArchiveIndexEntity> {

    public readonly config: ArchiveConfig;
    public readonly groups: Map<string, Group>;

    private _missingEncryptionKeys: number;

    public constructor(index: ArchiveIndexEntity, config: ArchiveConfig, properties?: Partial<AdditionalFileProperties>) {
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
        if(this.loaded && !this.js5Encoded) {
            return this.data;
        }

        this._missingEncryptionKeys = 0;

        if(this.name) {
            this.nameHash = this.store.hashFileName(this.name);
        }

        logger.info(`Decoding archive ${this.name}...`);

        const js5File = super.js5Decode();
        this.setData(js5File, true);

        this.generateCrc32();

        logger.info(`Archive ${this.name} calculated checksum: ${this.crc32}`);

        const archiveData = this.decompress();

        this.generateSha256();

        if(!archiveData?.length) {
            logger.error(`Error decompressing file data.`);
            return null;
        }

        const encrypted = this.encryption !== 'none';

        const format = this.index.format = archiveData.get('byte', 'unsigned');
        const filesNamed = (archiveData.get('byte', 'unsigned') & 0x01) !== 0;
        const groupCount = this.index.groupCount = archiveData.get('short', 'unsigned');

        logger.info(`${groupCount} groups were found within the ${this.name} archive.`);

        if(format !== this.config.format) {
            logger.error(`Archive ${this.name} format mismatch; expected ${this.config.format} but received ${format}!`);
        }

        if(filesNamed !== this.config.filesNamed) {
            logger.warn(`Archive file name flag mismatch; expected ${this.config.filesNamed} ` +
                `but received ${filesNamed}!`);
        }

        const groupIndices: number[] = new Array(groupCount);
        let accumulator = 0;

        for(let i = 0; i < groupCount; i++) {
            const delta = archiveData.get('short', 'unsigned');
            groupIndices[i] = accumulator += delta;
            const group = new Group(this.indexService.verifyGroupIndex({
                numericKey: groupIndices[i],
                name: String(groupIndices[i]),
                archive: this
            }), {
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
                group.nameHash = group.index.nameHash = archiveData.get('int');
                group.name = group.index.name = this.store.findFileName(group.nameHash, String(group.nameHash));
            }
        }

        /* read the crc values */
        for(const groupIndex of groupIndices) {
            const group = this.get(groupIndex);
            group.crc32 = group.index.crc32 = archiveData.get('int');
        }

        /* read the version numbers */
        for(const groupIndex of groupIndices) {
            const group = this.get(groupIndex);
            group.version = group.index.version = archiveData.get('int');
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
                group.set(childFileIndex, new FlatFile(this.indexService.verifyFileIndex({
                    numericKey: childFileIndex,
                    name: String(childFileIndex),
                    group, archive: this
                }), {
                    archive: this,
                    group: group
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
                        childFile.nameHash = childFile.index.nameHash = nameHash;
                        childFile.name = childFile.index.name =
                            this.store.findFileName(childFile.nameHash, String(childFile.nameHash));
                    }
                }
            }
        }

        if(decodeGroups) {
            let successes = 0;
            let failures = 0;

            for(const [ , group ] of this.groups) {
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
                logger.info(`${groupCount} file(s) were found, ` +
                    `${successes} decompressed successfully.`);
            } else {
                logger.info(`${groupCount} file(s) were found.`);
            }

            if(failures) {
                logger.error(`${failures} file(s) failed to decompress.`);
            }

            if(this.missingEncryptionKeys) {
                logger.error(`Missing ${this.missingEncryptionKeys} XTEA decryption key(s).`);
            }
        } else {
            logger.info(`${groupCount} file(s) were found.`);
        }

        this._js5Encoded = false;
        this._loaded = true;

        return this._data ?? null;
    }

    public override js5Encode(compress: boolean = true): ByteBuffer | null {
        if(this.loaded && this.js5Encoded) {
            return this.data;
        }

        if(!this.empty && (this.compressed || this.compression === 'none')) {
            return this.data;
        }

        if(this.numericKey === 255) {
            return this.store.js5Encode();
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

        const indexData = buffer?.flipWriter();

        if(indexData?.length) {
            this.setData(indexData, false);
            this.sha256 = this.index.sha256 = this.generateSha256();

            if(compress) {
                this.compress();
                this.crc32 = this.index.crc32 = this.generateCrc32();
            }
        }

        return this.data ?? null;
    }

    public override compress(): ByteBuffer | null {
        if(this.empty) {
            this.js5Encode(false);
        }

        return super.compress();
    }

    public override async read(compress: boolean = false): Promise<ByteBuffer> {
        if(this._loaded) {
            return this._data;
        }

        logger.info(`Reading archive ${this.name}...`);

        this._loaded = true;

        // Read in all groups within the archive
        const groupIndexes = Array.isArray(this.index.groups) ? this.index.groups : await this.index.groups;
        for(const groupIndex of groupIndexes) {
            const group = new Group(groupIndex, {
                archive: this,
                compression: this.config.compression,
                compressed: false,
                encryption: this.config.encryption,
                encrypted: false
            });

            this.groups.set(group.key, group);
            await group.read(false);
        }

        if(compress) {
            // Then compress them, if needed
            for(const [ , group ] of this.groups) {
                group.compress();
            }
        }

        logger.info(`${this.groups.size} file(s) were loaded from the ${this.name} archive.`);

        return this.js5Encode(compress);
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

    public override async validate(): Promise<void> {
        super.validate();
        this.js5Encode(true);
        await this.indexService.verifyArchiveIndex(this);

        for(const [ , group ] of this.groups) {
            await group.validate();
        }
    }

    public async saveIndexData(): Promise<void> {
        if(!this.groups.size) {
            return;
        }

        await this.validate();

        logger.info(`Saving archive ${this.name} to index...`);

        await this.indexService.saveArchiveIndex(this.index);

        logger.info(`Saving archive ${this.name} group indexes...`);

        const groups = Array.from(this.groups.values());
        const groupIndexes = groups.map(group => group.index);
        await this.indexService.saveGroupIndexes(groupIndexes);

        logger.info(`Saving archive ${this.name} file indexes...`);

        const flatFiles = groups.filter(group => group.files.size > 1).map(group => Array.from(group.files.values())
            .map(file => file.index)).reduce((a, v) => a.concat(v), []);
        await this.indexService.saveFileIndexes(flatFiles);

        logger.info(`Archive ${this.name} indexing complete.`);
    }

    public has(groupKey: string): boolean;
    public has(groupKey: number): boolean;
    public has(groupKey: string | number): boolean;
    public has(groupKey: string | number): boolean {
        return this.groups.has(String(groupKey));
    }

    public get(groupKey: string): Group | null;
    public get(groupKey: number): Group | null;
    public get(groupKey: string | number): Group | null;
    public get(groupKey: string | number): Group | null {
        return this.groups.get(String(groupKey)) ?? null;
    }

    public set(groupKey: string, group: Group): void;
    public set(groupKey: number, group: Group): void;
    public set(groupKey: string | number, group: Group): void;
    public set(groupKey: string | number, group: Group): void {
        this.groups.set(String(groupKey), group);
    }

    public find(groupName: string): Archive | Group | FlatFile | null {
        const children = Array.from(this.groups.values());
        return children.find(child => child?.name === groupName) ?? null;
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
