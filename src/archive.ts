import { join } from 'path';
import { existsSync, mkdirSync, rmSync } from 'graceful-fs';
import { ByteBuffer, logger } from '@runejs/common';

import { ArchiveFormat, FileState, FlatFile, Group } from './index';
import { ArchiveIndexEntity } from './db';
import { FileBreadcrumb, IndexedFile } from './indexed-file';
import { ArchiveConfig } from './config';
import { archiveFlags } from './config/archive-flags';


export class Archive extends IndexedFile<ArchiveIndexEntity> {

    public readonly config: ArchiveConfig;
    public readonly groups: Map<string, Group>;

    private _missingEncryptionKeys: number;

    public constructor(index: ArchiveIndexEntity, config: ArchiveConfig, breadcrumb?: Partial<FileBreadcrumb>) {
        super(index, breadcrumb);

        this.groups = new Map<string, Group>();

        config.filesNamed = config.filesNamed || false;
        config.versioned = config.versioned || false;

        this.config = config;
        this.encryption = this.config.encryption || 'none';
        this.compression = this.config.compression || 'none';
    }

    public override decode(decodeGroups: boolean = true): ByteBuffer | null {
        logger.info(`Decoding archive ${this.name}...`);

        this._missingEncryptionKeys = 0;

        this.unpack();

        logger.info(`Archive ${this.name} checksum: ${this.crc32}`);

        if(this.numericKey === 255) {
            return this.data;
        }

        this.decompress();

        if(!this._data?.length) {
            logger.error(`Error decompressing file data.`);
            return null;
        }

        const archiveData = this._data;
        const format = this.index.format = archiveData.get('byte', 'unsigned');
        const mainDataType = format >= ArchiveFormat.smart ? 'smart_int' : 'short';
        this.index.version = format >= ArchiveFormat.versioned ? archiveData.get('int') : 0;
        const flags = archiveFlags(archiveData.get('byte', 'unsigned'));
        const groupCount = archiveData.get(mainDataType, 'unsigned');

        logger.info(`${groupCount} groups were found within the ${this.name} archive.`);

        const groupKeys: number[] = new Array(groupCount);
        const groupChildCounts: Map<number, number> = new Map<number, number>();
        let accumulator = 0;

        // Group index keys
        for(let i = 0; i < groupCount; i++) {
            const delta = archiveData.get(mainDataType, 'unsigned');
            groupKeys[i] = accumulator += delta;
            const group = new Group(this.indexService.validateGroup({
                numericKey: groupKeys[i],
                name: String(groupKeys[i]),
                archive: this
            }), {
                store: this.store,
                archive: this
            });

            group.setState(FileState.encoded);
            this.set(groupKeys[i], group);
        }

        // Group names
        if(flags.groupNames) {
            for(const groupIndex of groupKeys) {
                const group = this.get(groupIndex);
                group.nameHash = group.index.nameHash = archiveData.get('int');
                group.name = group.index.name = this.store.findFileName(group.nameHash, String(group.nameHash));
            }
        }

        // Compressed file data CRC32 checksums
        for(const key of groupKeys) {
            const group = this.get(key);
            group.crc32 = archiveData.get('int');
        }

        // Decompressed file data CRC32 checksums
        if(flags.decompressedCrcs) {
            for(const key of groupKeys) {
                const decompressedCrc32 = archiveData.get('int');
                // @TODO assign to group (requires changing existing 'crc32' to 'compressedCrc`)
            }
        }

        // File data whirlpool digests
        if(flags.whirlpoolDigests) {
            for(const key of groupKeys) {
                const whirlpoolDigest = new ByteBuffer(512);
                archiveData.getBytes(whirlpoolDigest, 512);
                // @TODO assign to group
            }
        }

        // Group file sizes
        if(flags.groupSizes) {
            for(const key of groupKeys) {
                const compressedSize = archiveData.get('int');
                const decompressedSize = archiveData.get('int');
                // @TODO assign to group (requires changing existing 'size' to 'compressedSize')
            }
        }

        // Group version numbers
        for(const key of groupKeys) {
            const group = this.get(key);
            group.version = archiveData.get('int');
        }

        // Group file counts
        for(const key of groupKeys) {
            groupChildCounts.set(key, archiveData.get('short', 'unsigned'));
        }

        // Grouped file index keys
        for(const key of groupKeys) {
            const group = this.get(key) as Group;
            const fileCount = groupChildCounts.get(key);

            accumulator = 0;
            for(let i = 0; i < fileCount; i++) {
                const delta = archiveData.get(mainDataType, 'unsigned');
                const childFileIndex = accumulator += delta;
                group.set(childFileIndex, new FlatFile(this.indexService.validateFile({
                    numericKey: childFileIndex,
                    name: String(childFileIndex),
                    group, archive: this
                }), {
                    store: this.store,
                    archive: this,
                    group: group
                }));
            }
        }

        // Grouped file names
        if(flags.groupNames) {
            for(const key of groupKeys) {
                const fileGroup = this.get(key) as Group;

                for(const [ , file ] of fileGroup.files) {
                    const nameHash = archiveData.get('int');
                    if(file) {
                        file.nameHash = file.index.nameHash = nameHash;
                        file.name = file.index.name =
                            this.store.findFileName(file.nameHash, String(file.nameHash));
                    }
                }
            }
        }

        if(decodeGroups) {
            for(const [ , group ] of this.groups) {
                try {
                    group.decode();
                } catch(error) {
                    logger.error(error);
                }
            }

            if(this.missingEncryptionKeys) {
                logger.error(`Missing ${this.missingEncryptionKeys} XTEA decryption key(s).`);
            }
        } else {
            logger.info(`${groupCount} groups(s) were found.`);
        }

        this.setData(this._data, FileState.raw);
        return this._data ?? null;
    }

    public override encode(encodeGroups: boolean = true): ByteBuffer | null {
        if(this.numericKey === 255) {
            return this.store.encode();
        }

        const groups = this.groups;
        const groupCount = groups.size;

        // @TODO add sizes of all files instead of using a set amount here
        const buffer = new ByteBuffer(1000 * 1000);

        // Write index file header
        buffer.put(this.index.format ?? ArchiveFormat.original);
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
        for(const [ , ] of groups) {
            buffer.put(0, 'int');
        }

        // Write file group child counts
        for(const [ , group ] of groups) {
            buffer.put(group.files.size ?? 1, 'short');
        }

        // Write group file indices
        for(const [ , group ] of groups) {
            if(group.files.size > 1) {
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
                if(group.files.size > 1) {
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
            this.setData(indexData, FileState.encoded);
            this.sha256 = this.index.sha256 = this.generateSha256();
        }

        if(encodeGroups) {
            this.groups.forEach(group => group.encode());
        }

        return this.data ?? null;
    }

    public override compress(compressGroups: boolean = true): ByteBuffer | null {
        if(compressGroups) {
            this.groups.forEach(group => group.compress());
        }
        return super.compress();
    }

    public override async read(compress: boolean = false, readDiskFiles: boolean = true): Promise<ByteBuffer> {
        logger.info(`Reading archive ${this.name}...`);

        // Read in all groups within the archive
        const groupIndexes = await this.index.groups;
        for(const groupIndex of groupIndexes) {
            const group = new Group(groupIndex, {
                store: this.store,
                archive: this
            });

            this.groups.set(group.key, group);
            await group.read(false, readDiskFiles);
        }

        if(compress) {
            // Then compress them, if needed
            for(const [ , group ] of this.groups) {
                group.compress();
            }
        }

        logger.info(`${this.groups.size} groups(s) were loaded from the ${this.name} archive.`);

        this.encode();

        if(compress) {
            return this.compress();
        } else {
            return this._data;
        }
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

    public async saveIndexData(saveGroups: boolean = true, saveFiles: boolean = true): Promise<void> {
        if(!this.groups.size) {
            return;
        }

        logger.info(`Saving archive ${this.name} to index...`);

        await this.indexService.saveArchiveIndex(this);

        if(saveGroups) {
            await this.saveGroupIndexes(saveFiles);
        }

        logger.info(`Archive ${this.name} indexing complete.`);
    }

    public async saveGroupIndexes(saveFlatFiles: boolean = true): Promise<void> {
        const groups = Array.from(this.groups.values());

        if(groups?.length) {
            logger.info(`Saving archive ${ this.name } group indexes...`);
            await this.indexService.saveGroupIndexes(groups);
        }

        if(saveFlatFiles) {
            await this.saveFlatFileIndexes();
        }
    }

    public async saveFlatFileIndexes(): Promise<void> {
        if(this.config.flatten) {
            return;
        }

        const groups = Array.from(this.groups.values());
        const flatFiles = groups.filter(group => {
            if(!group?.files?.size || group?.index?.flatFile) {
                return false;
            }
            return group.files.size > 1;
        }).map(group => Array.from(group.files.values()))
            .reduce((a, v) => a.concat(v), []);

        if(flatFiles?.length) {
            logger.info(`Saving archive ${ this.name } flat file indexes...`);
            await this.indexService.saveFileIndexes(flatFiles);
        }
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

        return join(this.store.path, 'unpacked', this.name);
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
