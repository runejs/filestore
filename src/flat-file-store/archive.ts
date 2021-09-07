import { join } from 'path';
import { existsSync, readFileSync } from 'graceful-fs';
import { ArchiveContentType, ArchiveDetails, StoreConfig, StoreFileBase } from '@runejs/js5';
import { logger } from '@runejs/core';
import { ByteBuffer } from '@runejs/core/buffer';
import { Group } from './group';
import { FlatFileStore } from './flat-file-store';
import { ArchiveIndex, readIndexFile } from '../file-store';
import { File } from './file';
import { Compression } from '@runejs/core/compression';


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
    }

    public readArchiveContents(compress: boolean = false): void {
        this.indexData = readIndexFile(this.path);
        const extension = this.config.content?.fileExtension ?? '';
        const contentType: ArchiveContentType = this.config.content?.type ?? 'groups';

        for(const [ groupIndex, groupDetails ] of this.indexData.groups) {
            if(!groupDetails) {
                continue;
            }

            const group = new Group(groupIndex, this);
            group.nameHash = groupDetails.nameHash;
            group.version = groupDetails.version;
            group.crc32 = groupDetails.crc32;
            group.compression = Compression[this.config.compression];

            this.groups.set(groupIndex, group);

            const groupName = groupDetails.fileName;
            const expectedSize = groupDetails.size;

            if(contentType === 'files') {
                // read single file
                const fullFileName = groupName + extension;
                const filePath = join(this.path, fullFileName);

                if(!existsSync(filePath)) {
                    // logger.error(`${fullFileName} was not found.`);
                    continue;
                }

                const fileData = new ByteBuffer(readFileSync(filePath));

                if(fileData?.length !== expectedSize) {
                    logger.error(`${fullFileName} size mismatch - please re-index archive ${this.name}.`);
                    continue;
                }

                group.setData(fileData, false);
            } else {
                // read directory
                const groupPath = join(this.path, groupName);

                if(!existsSync(groupPath)) {
                    logger.error(`${groupName} was not found.`);
                    continue;
                }

                const groupFileNames = groupDetails.fileNames ?? [];

                for(const groupFileName of groupFileNames) {
                    const file = new File(groupFileName, group);
                    group.files.set(groupFileName, file);

                    const fullFileName = groupFileName + extension;
                    const groupFilePath = join(groupPath, fullFileName);

                    if(!existsSync(groupFilePath)) {
                        const groupDebugPath = join(groupFileName, fullFileName);
                        logger.error(`${groupDebugPath} was not found.`);
                        continue;
                    }

                    const fileData = new ByteBuffer(readFileSync(groupFilePath));
                    if(fileData?.length) {
                        file.setData(fileData, false);
                    }
                }
            }

            if(compress) {
                group.compress();
            }
        }
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
