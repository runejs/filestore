import { join } from 'path';
import { existsSync, mkdirSync, rmSync } from 'graceful-fs';
import { ByteBuffer, logger } from '@runejs/common';

import { FileState, FlatFile, Group } from './index';
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
                store: this.store,
                archive: this
            });

            group.setState(FileState.encoded);
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
            group.crc32 = archiveData.get('int');
        }

        /* read the version numbers */
        for(const groupIndex of groupIndices) {
            const group = this.get(groupIndex);
            group.version = archiveData.get('int');
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
                    store: this.store,
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
                    group.decode();

                    if(group.data?.length && group.state === FileState.raw) {
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
        const groupIndexes = Array.isArray(this.index.groups) ? this.index.groups : await this.index.groups;
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

        logger.info(`${this.groups.size} file(s) were loaded from the ${this.name} archive.`);

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

    public override async validateIndex(validateGroups: boolean = true, validateFiles: boolean = true): Promise<void> {
        super.validateIndex();
        await this.indexService.verifyArchiveIndex(this);

        if(validateGroups) {
            await this.validateGroups(false);
        }

        if(validateFiles) {
            await this.validateFiles();
        }
    }

    public async validateGroups(validateFiles: boolean = true): Promise<void> {
        const promises = new Array(this.groups.size);
        let idx = 0;

        for(const [ , group ] of this.groups) {
            promises[idx++] = group.validateIndex(false);
        }

        await Promise.all(promises);

        if(validateFiles) {
            await this.validateFiles();
        }
    }

    public async validateFiles(): Promise<void> {
        const promises = new Array(this.groups.size);
        let idx = 0;

        for(const [ , group ] of this.groups) {
            promises[idx++] = group.validateFileIndexes();
        }

        await Promise.all(promises);
    }

    public async saveIndexData(saveGroups: boolean = true, saveFiles: boolean = true): Promise<void> {
        if(!this.groups.size) {
            return;
        }

        await this.validateIndex();

        logger.info(`Saving archive ${this.name} to index...`);

        await this.indexService.saveArchiveIndex(this.index);

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
