import { join } from 'path';
import { existsSync, readFileSync, readdirSync, statSync, mkdirSync } from 'graceful-fs';
import { logger } from '@runejs/common';
import { ByteBuffer } from '@runejs/common/buffer';
import { FileCompression } from '@runejs/common/compression';
import { ArchiveIndex, GroupIndex, readArchiveIndexFile, writeArchiveIndexFile } from './archive-index';
import { File } from './file';
import { Group } from './group';
import { FlatFileStore } from './flat-file-store';
import { nameSorter } from '../util';
import { ArchiveDetails, StoreConfig } from '../config';
import { IndexedFile } from './indexed-file';


export class Archive extends IndexedFile<ArchiveIndex> {

    public readonly groups: Map<string, Group>;
    public readonly details: ArchiveDetails;

    public constructor(index: string | number, store: FlatFileStore) {
        super(index, store);
        this.groups = new Map<string, Group>();
        this.name = StoreConfig.getArchiveName(this.index);
        this.details = StoreConfig.getArchiveDetails(this.index);
        this.compression = FileCompression[this.details.compression];
    }

    public readFiles(compress: boolean = false): void {
        logger.info(`Reading archive ${this.name}...`);

        this._indexData = readArchiveIndexFile(this.path);
        this.crc32 = this.indexData.crc32;
        this.sha256 = this.indexData.sha256;

        for(const [ groupIndex, groupDetails ] of this.indexData.groups) {
            const group = new Group(groupIndex, this, groupDetails);
            this.groups.set(groupIndex, group);
            group.readFiles(compress);
        }

        this.generateJs5Index(compress);

        logger.info(`${this.groups.size} file(s) were loaded from the ${this.name} archive.`);
        this._loaded = true;
    }

    public generateJs5Index(compress: boolean = false): ByteBuffer {
        if(!this.groups.size) {
            this.readFiles();
        }

        // @TODO add sizes of all files, etc
        const buffer = new ByteBuffer(1000 * 1000);

        const groups = this.groups;
        const groupCount = this.groups.size;

        // Write index file header
        buffer.put(this.details.format ?? 5); // '5' for 'JS5' by default
        buffer.put(this.details.saveFileNames ? 1 : 0);
        buffer.put(groupCount, 'short');

        // Write file indexes
        let writtenFileIndex = 0;
        for(const [ , group ] of groups) {
            const val = group.numericIndex;
            buffer.put(val - writtenFileIndex, 'short');
            writtenFileIndex = val;
        }

        // Write name hashes (if applicable)
        if(this.details.saveFileNames) {
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
            buffer.put(group.files.size ?? 1, 'short');
        }

        // Write group file indices
        for(const [ , group ] of groups) {
            if(group.files.size > 1) {
                writtenFileIndex = 0;

                for(const [ , file ] of group.files) {
                    const i = file.numericIndex;
                    buffer.put(i - writtenFileIndex, 'short');
                    writtenFileIndex = i;
                }
            } else {
                buffer.put(0, 'short');
            }
        }

        // Write group file name hashes (if applicable)
        if(this.details.saveFileNames) {
            for(const [ , group ] of groups) {
                if(group.files.size > 1) {
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
                this.indexData.sha256 = this.sha256;
            }

            if(compress) {
                const originalCrc = this.crc32;
                this.compress();
                this.generateCrc32();

                if(originalCrc !== this.crc32) {
                    // logger.warn(`Archive ${this.name} checksum has changed from ${originalCrc} to ${this.crc32}.`);
                    this.indexData.crc32 = this.crc32;
                }
            }

            return this._data;
        }

        return null;
    }

    public findGroupIndex(groupIndexOrName: string): string {
        const nameSearch = this.details.saveFileNames && !(/^\d*$/.test(groupIndexOrName));

        for(const [ groupIndex, group ] of this.indexData.groups) {
            if(nameSearch) {
                if(group.name === groupIndexOrName) {
                    return groupIndex;
                }
            } else {
                if(groupIndex === groupIndexOrName) {
                    return groupIndex;
                }
            }
        }

        return null;
    }

    public newGroupIndex(): string {
        if(this.groups.size === 0) {
            return '0';
        }

        const fileIndices = Array.from(this.groups.keys()).map(key => Number(key));
        return String(Math.max(...fileIndices) + 1);
    }

    public override generateIndexData(): ArchiveIndex {
        const groupMetaData = new Map<string, GroupIndex>();

        for(const [ groupIndex, group ] of this.groups) {
            groupMetaData.set(groupIndex, group.generateIndexData());
        }

        this._indexData = {
            index: this.numericIndex,
            crc32: this.crc32,
            sha256: this.sha256,
            groups: groupMetaData
        };

        return this._indexData;
    }

    public writeArchiveIndexFile(): void {
        try {
            if(!existsSync(this.outputPath)) {
                mkdirSync(this.outputPath, { recursive: true });
            }

            writeArchiveIndexFile(this.outputPath, this.generateIndexData());
        } catch(error) {
            logger.error(error);
        }
    }

    public indexFiles(): void {
        if(!this.loaded || this.compressed) {
            this.readFiles(false);
        }

        const directoryFileNames = readdirSync(this.path).filter(fileName => fileName && fileName !== '.index');
        const fileExtension = this.details.fileExtension ?? '';
        let indexChanges = false;

        for(let fileName of directoryFileNames) {
            const extensionIndex = fileExtension ? fileName.indexOf(fileExtension) : -1;
            if(extensionIndex !== -1) {
                fileName = fileName.substring(0, extensionIndex);
            }

            const fileIndex = this.findGroupIndex(fileName);
            if(!fileIndex) {
                // New file added
                this.indexNewGroup(fileName);
                indexChanges = true;
            } else {
                if(this.indexExistingGroup(fileIndex, fileName)) {
                    // Existing file changed or removed
                    indexChanges = true;
                }
            }
        }

        this.generateJs5Index(true);

        if(this.crc32 !== this.indexData.crc32) {
            this.indexData.crc32 = this.crc32;
            indexChanges = true;
        }

        if(this.sha256 !== this.indexData.sha256) {
            this.indexData.sha256 = this.sha256;
            indexChanges = true;
        }

        if(indexChanges) {
            logger.info(`Archive ${this.name} has been re-indexed successfully.`);
        } else {
            logger.info(`Archive ${this.name} has no file changes.`);
        }
    }

    public indexExistingGroup(groupIndex: string, groupName: string): boolean {
        const group = this.groups.get(groupIndex);

        if(!group.modified) {
            // No changes detected
            return false;
        }

        logger.info(`Re-indexing existing file group ${groupName} in archive ${this.name}.`);

        if(group.name !== groupName) {
            group.name = groupName;
            if(!this.details.saveFileNames) {
                group.nameHash = 0;
            }
        }

        let groupPath = join(this.path, groupName);
        const fileStats = statSync(groupPath);
        const fileExtension = this.details.fileExtension ?? undefined;

        if(fileStats.isDirectory()) {
            const groupFileNames = Array.from(group.files.values()).map(file => file.nameOrIndex);
            const discoveredFileNames = readdirSync(groupPath).map(name => {
                if(fileExtension) {
                    const extensionIndex = name.indexOf(fileExtension);
                    if(extensionIndex !== -1) {
                        return name.substring(0, extensionIndex);
                    }
                }

                return name;
            }).sort((name1, name2) =>
                nameSorter(name1, name2));

            const newGroupFileNames: string[] = discoveredFileNames.filter(name => groupFileNames.indexOf(name) === -1);

            for(const [ , file ] of group.files) {
                if(discoveredFileNames.indexOf(file.name) === -1) {
                    // group file deleted
                    file.setData(new ByteBuffer([]), false);
                    file.size = 0;
                    file.crc32 = undefined;
                    file.sha256 = undefined;
                } else {
                    file.generateCrc32();
                }
            }

            if(newGroupFileNames.length) {
                for(const fileName of newGroupFileNames) {
                    const filePath = join(groupPath, (fileName + fileExtension));
                    const fileData = new ByteBuffer(readFileSync(filePath) ?? []);
                    const file = new File(group.createNewFileIndex(), group);
                    file.setData(fileData, false);
                    file.size = fileData.length;
                    file.generateCrc32();

                    if(group.stripeCount === 1) {
                        file.stripeSizes = [ file.size ];
                    } else if(group.stripeCount > 1) {
                        // @TODO
                    }
                }
            }

            // @TODO stopped here
        } else {
            groupPath += fileExtension;

            // @TODO stopped here
        }

        group.encode();
        group.generateCrc32();

        this.groups.set(groupIndex, group);
        this.indexData.groups.set(groupIndex, group.generateIndexData());
        return true;
    }

    public indexNewGroup(groupName: string): void {
        const fileExtension = this.details.fileExtension ?? '';
        const fileIndex = this.newGroupIndex();

        if(!fileIndex) {
            return;
        }

        let groupPath = join(this.path, groupName);
        const fileStats = statSync(groupPath);

        const group = new Group(fileIndex, this);

        group.stripeCount = 1;
        group.size = 0;

        if(this.details.saveFileNames) {
            group.name = groupName;
        } else {
            group.name = fileIndex;
            group.nameHash = 0;
        }

        logger.info(`Indexing new file group ${groupName} in archive ${this.name}.`);

        if(fileStats.isDirectory()) {
            // index new group
            const groupFileNames = readdirSync(groupPath).sort((name1, name2) =>
                nameSorter(name1, name2));

            // Brand new group, so we'll sort the files by child ids as they should be in order for brand new groups

            let lastIndex = 0;

            for(const fileName of groupFileNames) {
                let fileIndex = fileName;
                if(!(/^\d*$/.test(fileName))) {
                    fileIndex = String(++lastIndex);
                }

                lastIndex = Number(fileIndex);

                const file = new File(fileIndex, group);
                group.files.set(fileIndex, file);

                if(this.details.saveFileNames) {
                    file.name = fileName;
                } else {
                    file.name = fileIndex;
                    file.nameHash = 0;
                }

                const filePath = join(groupPath, (fileName + fileExtension));

                if(existsSync(filePath)) {
                    const fileData = new ByteBuffer(readFileSync(filePath) ?? []);
                    file.setData(fileData, false);
                    file.generateCrc32();
                    file.size = fileData.length;
                    group.size += file.size;
                }

                file.stripeSizes = file.size ? [ file.size ] : undefined;
            }
        } else {
            // Index brand new flat file

            const file = new File('0', group);
            group.files.set('0', file);

            groupPath += fileExtension;

            if(existsSync(groupPath)) {
                const fileData = new ByteBuffer(readFileSync(groupPath) ?? []);
                group.setData(fileData, false);
                file.setData(fileData, false);
                file.generateCrc32();
                file.size = group.size = fileData.length;
            }

            file.stripeSizes = file.size ? [ file.size ] : undefined;
        }

        group.encode();
        group.generateCrc32();

        this.groups.set(fileIndex, group);
        this.indexData.groups.set(fileIndex, group.generateIndexData());
    }

    /**
     * Adds a new or replaces an existing group within the archive.
     * @param fileIndex The index of the group to add or change.
     * @param group The group to add or change.
     */
    public setGroup(fileIndex: number | string, group: Group): void {
        this.groups.set(typeof fileIndex === 'number' ? String(fileIndex) : fileIndex, group);
    }

    /**
     * Fetches a group from this archive by index.
     * @param fileIndex The index of the group to find.
     */
    public getGroup(fileIndex: number | string): Group {
        return this.groups.get(typeof fileIndex === 'number' ? String(fileIndex) : fileIndex);
    }

    public override get path(): string {
        return join(this.store.storePath, 'archives', this.name);
    }

    public override get outputPath(): string {
        return join(this.store.outputPath, this.name);
    }
}
