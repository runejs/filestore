import { join } from 'path';
import { existsSync, readFileSync } from 'graceful-fs';
import { ArchiveDetails, StoreConfig, StoreFileBase } from '@runejs/js5';
import { logger } from '@runejs/core';
import { ByteBuffer } from '@runejs/core/buffer';
import { Compression } from '@runejs/core/compression';
import { File } from './file';
import { Group } from './group';
import { FlatFileStore } from './flat-file-store';
import { ArchiveIndex, readIndexFile } from './archive-index';


export class Archive extends StoreFileBase {

    public readonly store: FlatFileStore;
    public readonly groups: Map<string, Group>;
    public readonly config: ArchiveDetails;

    public indexData: ArchiveIndex;

    public constructor(index: string | number, store: FlatFileStore) {
        super(index);
        this.store = store;
        this.groups = new Map<string, Group>();
        this.name = StoreConfig.getArchiveName(this.index);
        this.config = StoreConfig.getArchiveDetails(this.index);
        this.compression = Compression[this.config.compression];
    }

    public generateIndexFile(): ByteBuffer {
        if(!this.groups.size) {
            this.readFiles();
        }

        // @TODO add sizes of all files, etc
        const buffer = new ByteBuffer(1000 * 1000);

        const groups = this.groups;
        const groupCount = this.groups.size;

        // Write index file header
        buffer.put(this.config.format ?? 5); // '5' for 'JS5' by default
        buffer.put(this.config.content?.saveFileNames ? 1 : 0);
        buffer.put(groupCount, 'short');

        // Write file indexes
        let writtenFileIndex = 0;
        for(const [ , group ] of groups) {
            const val = group.numericIndex;
            buffer.put(val - writtenFileIndex, 'short');
            writtenFileIndex = val;
        }

        // Write name hashes (if applicable)
        if(this.config.content?.saveFileNames) {
            for(const [ , file ] of groups) {
                buffer.put(file.nameHash, 'int');
            }
        }

        // Write file crc values
        for(const [ , file ] of groups) {
            buffer.put(file.crc32, 'int');
        }

        // Write file version numbers
        for(const [ , file ] of groups) {
            buffer.put(file.version ?? 1, 'int');
        }

        // Write file group child counts
        for(const [ , group ] of groups) {
            buffer.put(group.files.size ?? 1, 'short');
        }

        // Write group file indices
        for(const [ , group ] of groups) {
            if(group.files.size) {
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
        if(this.config.content?.saveFileNames) {
            for(const [ , group ] of groups) {
                if(group.files.size) {
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

            if(indexDigest !== this.generateSha256()) {
                logger.warn(`Detected index changes for ${this.name}.`);
            }

            this.compress(false);
            this.generateCrc32();

            return this._data;
        }

        return null;
    }

    public readFiles(compress: boolean = false): void {
        this.indexData = readIndexFile(this.path);
        this.crc32 = this.indexData.crc32;
        this.sha256 = this.indexData.sha256;
        const extension = this.config.content?.fileExtension ?? '';

        for(const [ groupIndex, groupDetails ] of this.indexData.groups) {
            if(!groupDetails) {
                continue;
            }

            const group = new Group(groupIndex, this);
            const groupDigest = group.sha256 = groupDetails.sha256;
            group.nameHash = groupDetails.nameHash ?? 0;
            group.version = groupDetails.version;
            group.crc32 = groupDetails.crc32;
            group.compression = this.compression;

            this.groups.set(groupIndex, group);

            const groupName = groupDetails.name;

            let fileNotFound = false;

            if(groupDetails.files.size === 1) {
                // read single file
                const fullFileName = groupName + extension;
                const filePath = join(this.path, fullFileName);

                const childFile = new File('0', group);
                childFile.nameHash = group.nameHash;
                group.files.set('0', childFile);

                if(!existsSync(filePath)) {
                    fileNotFound = true;
                } else {
                    const fileData = new ByteBuffer(readFileSync(filePath));
                    group.setData(fileData, false);
                }
            } else {
                // read directory
                const groupPath = join(this.path, groupName);

                if(!existsSync(groupPath)) {
                    fileNotFound = true;
                } else {
                    for(const [ fileIndex, fileDetails ] of groupDetails.files) {
                        const file = new File(fileIndex, group);
                        group.files.set(fileIndex, file);

                        const fullFileName = fileDetails.name + extension;
                        const groupFilePath = join(groupPath, fullFileName);

                        if(!existsSync(groupFilePath)) {
                            const groupDebugPath = join(groupName, fullFileName);
                            logger.error(`${groupDebugPath} was not found.`);
                            continue;
                        }

                        const fileData = new ByteBuffer(readFileSync(groupFilePath));
                        if(fileData?.length) {
                            file.setData(fileData, false);
                        }
                    }

                    group.encode();
                }
            }

            if(fileNotFound) {
                // logger.error(`${groupName} was not found.`);
            } else {
                if(group.generateSha256() !== groupDigest) {
                    // @TODO re-index file or notify
                    logger.warn(`Detected file changes for ${this.name}/${groupName}`,
                        `Orig Digest: ${groupDigest}`, `Curr Digest: ${group.sha256}`);
                }

                if(compress) {
                    logger.info(`Compressing...`);
                    group.compress();
                }
            }
        }

        this.generateIndexFile();
    }

    public indexArchiveContents(): void {
        // @TODO this will be used for re-indexing the archive later on :)
        /*const stats = statSync(this.path);

        if(!stats.isDirectory()) {
            logger.error(`Error loading ${this.name} archive, ${this.path} is not a valid directory.`);
            return;
        }

        const directoryFileNames = readdirSync(this.path);

        if(!directoryFileNames?.length) {
            logger.error(`Error loading ${this.name} archive, ${this.path} is empty.`);
            return;
        }

        const indexFilePointer = directoryFileNames.indexOf('.index');

        if(indexFilePointer === -1) {
            logger.error(`Error loading ${this.name} archive, ${this.path} has no index file.`);
            return;
        }

        directoryFileNames.splice(indexFilePointer, 1);

        for(const fileName of directoryFileNames) {

        }*/
    }

    public get path(): string {
        return join(this.store.storePath, this.name);
    }

}
