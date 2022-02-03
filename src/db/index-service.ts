import path from 'path';
import { Connection, ConnectionOptions, createConnection, Repository } from 'typeorm';

import { logger } from '@runejs/common';

import { Archive, FlatFile, Group, Store } from '../fs';
import { StoreIndexEntity, ArchiveIndexEntity, GroupIndexEntity, FileIndexEntity } from './index';


export class IndexService {

    public readonly store: Store;

    private connection: Connection;

    public constructor(store: Store) {
        this.store = store;
    }

    public async load(): Promise<void> {
        this.connection = await createConnection({
            type: 'sqlite',
            database: path.join(this.store.path, 'archives', 'index.sqlite3'),
            entities: [ StoreIndexEntity, ArchiveIndexEntity, GroupIndexEntity, FileIndexEntity ],
            synchronize: true,
            logging: [ 'error' ],
            name: 'filestore-cli'
        });
    }

    public async getStoreIndex(): Promise<StoreIndexEntity | null> {
        return await this.storeRepo.findOne({
            where: {
                gameVersion: this.store.gameVersion
            }
        }) || null;
    }

    public async saveStoreIndex(): Promise<StoreIndexEntity | null> {
        const storeIndex = new StoreIndexEntity();
        storeIndex.gameVersion = this.store.gameVersion;

        logger.info(`Saving store index ${this.store.gameVersion}...`);

        if(!this.connection.isConnected) {
            logger.error(`The index database connection was closed prematurely.`);
            return null;
        }

        const savedIndex = await this.storeRepo.save(storeIndex);

        if(savedIndex?.gameVersion !== this.store.gameVersion) {
            logger.error(`Error saving store index ${this.store.gameVersion}.`);
            return null;
        }

        logger.info(`Store index ${this.store.gameVersion} saved.`);

        return savedIndex;
    }

    public async getArchiveIndex(archive: Archive): Promise<ArchiveIndexEntity | null> {
        return await this.archiveRepo.findOne({
            where: {
                key: archive.numericKey,
                gameVersion: this.store.gameVersion
            }
        }) || null;
    }

    public createArchiveIndex(archive: Archive): ArchiveIndexEntity {
        const { numericKey, name, nameHash, version, size, crc32, sha256 } = archive;

        const archiveIndex = new ArchiveIndexEntity();
        archiveIndex.key = numericKey;
        archiveIndex.store = Promise.resolve(this.getStoreIndex());
        archiveIndex.gameVersion = this.store.gameVersion;
        archiveIndex.name = name;
        archiveIndex.nameHash = nameHash;
        archiveIndex.version = version;
        archiveIndex.size = size;
        archiveIndex.crc32 = crc32;
        archiveIndex.sha256 = sha256;

        return archiveIndex;
    }

    public async saveArchiveIndex(archiveIndex: ArchiveIndexEntity): Promise<ArchiveIndexEntity> {
        const existingIndex = await this.archiveRepo.findOne({
            where: {
                key: archiveIndex.key,
                gameVersion: archiveIndex.gameVersion
            }
        });

        if(existingIndex) {
            const result = await this.archiveRepo.update({
                key: archiveIndex.key,
                gameVersion: archiveIndex.gameVersion
            }, archiveIndex);

            return archiveIndex;
        } else {
            return await this.archiveRepo.save(archiveIndex);
        }
    }

    public async getGroupIndex(group: Group): Promise<GroupIndexEntity | null> {
        return await this.groupRepo.findOne({
            where: {
                key: group.numericKey,
                archiveKey: group.archive.numericKey,
                gameVersion: this.store.gameVersion
            }
        }) || null;
    }

    public async getGroupIndexes(archive: Archive): Promise<GroupIndexEntity[]> {
        return await this.groupRepo.find({
            where: {
                archiveKey: archive.numericKey,
                gameVersion: this.store.gameVersion
            },
            order: {
                key: 'DESC'
            }
        });
    }

    public createGroupIndex(group: Group): GroupIndexEntity {
        const { numericKey, name, nameHash, version, size, crc32, sha256, stripeCount, archive } = group;

        const groupIndex = new GroupIndexEntity();
        groupIndex.key = numericKey;
        groupIndex.store = Promise.resolve(this.getStoreIndex());
        groupIndex.archive = Promise.resolve(this.getArchiveIndex(archive));
        groupIndex.gameVersion = this.store.gameVersion;
        groupIndex.archiveKey = archive.numericKey;
        groupIndex.name = name;
        groupIndex.nameHash = nameHash;
        groupIndex.version = version;
        groupIndex.size = size;
        groupIndex.crc32 = crc32;
        groupIndex.sha256 = sha256;

        if(group.files.size === 1) {
            const file = group.get(0);
            groupIndex.flatFile = true;
            groupIndex.stripes = file.stripes?.join(',') || String(file.size || size);
            groupIndex.stripeCount = groupIndex.stripes?.length || 1;
        } else {
            groupIndex.flatFile = false;
            groupIndex.stripes = null;
            groupIndex.stripeCount = stripeCount;
        }

        return groupIndex;
    }

    public async saveGroupIndex(groupIndex: GroupIndexEntity): Promise<GroupIndexEntity> {
        return await this.groupRepo.save(groupIndex);
    }

    public async saveGroupIndexes(groupIndexes: GroupIndexEntity[]): Promise<GroupIndexEntity[]> {
        return await this.groupRepo.save(groupIndexes, { chunk: 100 });
    }

    public async getFileIndex(file: FlatFile): Promise<FileIndexEntity | null> {
        return await this.fileRepo.findOne({
            where: {
                key: file.numericKey,
                groupKey: file.group.numericKey,
                archiveKey: file.archive.numericKey,
                gameVersion: this.store.gameVersion
            }
        }) || null;
    }

    public async getFileIndexes(archiveOrGroup: Archive | Group): Promise<FileIndexEntity[]> {
        if(archiveOrGroup instanceof Archive) {
            // Return all files for the specified archive

            return await this.fileRepo.find({
                where: {
                    archiveKey: archiveOrGroup.numericKey,
                    gameVersion: this.store.gameVersion
                },
                order: {
                    groupKey: 'DESC',
                    key: 'DESC'
                }
            });
        } else {
            // Return all files for the specified group

            return await this.fileRepo.find({
                where: {
                    groupKey: archiveOrGroup.numericKey,
                    archiveKey: archiveOrGroup.archive.numericKey,
                    gameVersion: this.store.gameVersion
                },
                order: {
                    key: 'DESC'
                }
            });
        }
    }

    public createFileIndex(file: FlatFile): FileIndexEntity {
        const { numericKey, name, nameHash, version, size, crc32, sha256, stripes, group, archive } = file;

        const fileIndex = new FileIndexEntity();
        fileIndex.store = Promise.resolve(this.getStoreIndex());
        fileIndex.archive = Promise.resolve(this.getArchiveIndex(archive));
        fileIndex.group = Promise.resolve(this.getGroupIndex(group));
        fileIndex.gameVersion = this.store.gameVersion;
        fileIndex.archiveKey = archive.numericKey;
        fileIndex.groupKey = group.numericKey;
        fileIndex.key = numericKey;
        fileIndex.name = name;
        fileIndex.nameHash = nameHash;
        fileIndex.version = version;
        fileIndex.size = size;
        fileIndex.crc32 = crc32;
        fileIndex.sha256 = sha256;
        fileIndex.stripes = stripes?.join(',') || String(size);
        fileIndex.stripeCount = fileIndex.stripes?.length || 1;

        return fileIndex;
    }

    public async saveFileIndex(fileIndex: FileIndexEntity): Promise<FileIndexEntity> {
        return await this.fileRepo.save(fileIndex);
    }

    public async saveFileIndexes(fileIndexes: FileIndexEntity[]): Promise<FileIndexEntity[]> {
        return await this.fileRepo.save(fileIndexes, { chunk: 100 });
    }

    public get loaded(): boolean {
        return !!this.connection;
    }

    public get storeRepo(): Repository<StoreIndexEntity> {
        return this.connection.getRepository(StoreIndexEntity);
    }

    public get archiveRepo(): Repository<ArchiveIndexEntity> {
        return this.connection.getRepository(ArchiveIndexEntity);
    }

    public get groupRepo(): Repository<GroupIndexEntity> {
        return this.connection.getRepository(GroupIndexEntity);
    }

    public get fileRepo(): Repository<FileIndexEntity> {
        return this.connection.getRepository(FileIndexEntity);
    }

}
