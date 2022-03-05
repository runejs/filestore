import { join } from 'path';
import { existsSync, mkdirSync } from 'graceful-fs';
import { Connection, createConnection, Repository } from 'typeorm';

import { logger } from '@runejs/common';

import { Archive, FlatFile, Group, Store } from '../fs';
import { StoreIndexEntity, ArchiveIndexEntity, GroupIndexEntity, FileIndexEntity } from './index';


const CHUNK_SIZE = 300; // 250


export class IndexService {

    public readonly store: Store;

    private connection: Connection;

    public constructor(store: Store) {
        this.store = store;
    }

    public async load(): Promise<void> {
        const indexPath = join(this.store.path, 'indexes');

        if(!existsSync(indexPath)) {
            mkdirSync(indexPath, { recursive: true });
        }

        this.connection = await createConnection({
            type: 'better-sqlite3',
            database: join(indexPath, `index_${this.store.gameVersion}.sqlite3`),
            entities: [ StoreIndexEntity, ArchiveIndexEntity, GroupIndexEntity, FileIndexEntity ],
            synchronize: true,
            logging: [ 'error', 'warn' ],
            // logging: 'all',
            name: 'index-service'
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
        let storeIndex = await this.getStoreIndex();
        let update = true;

        if(!storeIndex) {
            storeIndex = new StoreIndexEntity();
            update = false;
        }

        if(!storeIndex.gameVersion) {
            storeIndex.gameVersion = this.store.gameVersion;
        }

        if(!this.connection.isConnected) {
            logger.error(`The index database connection was closed prematurely.`);
            return null;
        }

        storeIndex.data = this.store.data?.toNodeBuffer() || null;

        delete storeIndex.archives;
        delete storeIndex.groups;
        delete storeIndex.files;

        let savedIndex: StoreIndexEntity;

        if(update) {
            const updateResult = await this.storeRepo.update({
                gameVersion: this.store.gameVersion
            }, storeIndex);

            if(!updateResult?.affected) {
                logger.error(`Main store entity update failed.`);
                return null;
            }

            savedIndex = await this.getStoreIndex();
        } else {
            savedIndex = await this.storeRepo.save(storeIndex);
        }

        if(savedIndex?.gameVersion !== this.store.gameVersion) {
            logger.error(`Error saving store index ${this.store.gameVersion}.`);
            return null;
        }

        logger.info(`Store index ${this.store.gameVersion} saved.`);

        return savedIndex;
    }

    public async getArchiveIndex(archive: Archive): Promise<ArchiveIndexEntity | null>;
    public async getArchiveIndex(archiveKey: number): Promise<ArchiveIndexEntity | null>;
    public async getArchiveIndex(archive: Archive | number): Promise<ArchiveIndexEntity | null> {
        const key = typeof archive === 'number' ? archive : archive.numericKey;
        return await this.archiveRepo.findOne({
            where: {
                key, gameVersion: this.store.gameVersion
            },
            relations: [ 'groups' ]
        }) || null;
    }

    public async getArchiveIndexes(): Promise<ArchiveIndexEntity[]> {
        return await this.archiveRepo.find({
            where: {
                gameVersion: this.store.gameVersion
            },
            order: {
                key: 'ASC'
            },
            relations: [ 'groups' ]
        }) || [];
    }

    public verifyArchiveIndex(archive: Archive | Partial<Archive>): ArchiveIndexEntity {
        const { numericKey, name, size, crc32, sha256, state } = archive;

        let archiveIndex: ArchiveIndexEntity;

        if(archive.index) {
            archiveIndex = archive.index;
            archiveIndex.groupCount = archive.groups?.size ?? 0;
            archiveIndex.format = archive.index.format;
        } else {
            archiveIndex = new ArchiveIndexEntity();
            archiveIndex.key = numericKey;
        }

        if(!archiveIndex.format) {
            archiveIndex.format = 5;
        }

        archiveIndex.gameVersion = this.store.gameVersion;
        archiveIndex.name = name;
        archiveIndex.size = size;
        archiveIndex.crc32 = crc32;
        archiveIndex.sha256 = sha256;
        archiveIndex.state = state;

        return archiveIndex;
    }

    public async saveArchiveIndex(archiveIndex: ArchiveIndexEntity): Promise<ArchiveIndexEntity> {
        const existingIndex = await this.archiveRepo.findOne({
            where: {
                key: archiveIndex.key,
                gameVersion: this.store.gameVersion
            }
        });

        let affected;

        if(existingIndex) {
            const { name, size, sha256, crc32, data, state } = archiveIndex;
            existingIndex.name = name;
            existingIndex.size = size;
            existingIndex.sha256 = sha256;
            existingIndex.crc32 = crc32;
            existingIndex.data = data;
            existingIndex.state = state;

            delete existingIndex.groups;

            const result = await this.archiveRepo.update({
                key: archiveIndex.key,
                gameVersion: this.store.gameVersion
            }, existingIndex);

            affected = result?.affected || 0;
        } else {
            delete archiveIndex.groups;

            const result = await this.archiveRepo.insert(archiveIndex);
            affected = result?.identifiers?.length || 0;
        }

        if(!affected) {
            logger.error(`Error updating archive ${archiveIndex.name} database index.`);
        } else {
            logger.info(`Archive ${archiveIndex.name} database index saved.`);
        }

        return await this.getArchiveIndex(archiveIndex.key);
    }

    public async getGroupIndex(group: Group): Promise<GroupIndexEntity | null>;
    public async getGroupIndex(groupKey: number, archiveKey: number): Promise<GroupIndexEntity | null>;
    public async getGroupIndex(group: Group | number, archive?: number): Promise<GroupIndexEntity | null> {
        const key = typeof group === 'number' ? group : group.numericKey;
        const archiveKey = typeof group === 'number' ? archive : group.archive.numericKey;

        return await this.groupRepo.findOne({
            where: {
                key, archiveKey,
                gameVersion: this.store.gameVersion
            }
        }) || null;
    }

    public async getGroupIndexes(archive: ArchiveIndexEntity): Promise<GroupIndexEntity[]> {
        return await this.groupRepo.find({
            where: {
                archiveKey: archive.key,
                gameVersion: this.store.gameVersion
            },
            order: {
                key: 'ASC'
            }
        }) || [];
    }

    public verifyGroupIndex(group: Group | Partial<Group>): GroupIndexEntity {
        const { numericKey, name, nameHash, version, size, crc32, sha256, stripes, archive, files, state } = group;

        let groupIndex: GroupIndexEntity;

        if(group.index) {
            groupIndex = group.index;
        } else {
            groupIndex = new GroupIndexEntity();
            groupIndex.key = numericKey;
        }

        groupIndex.gameVersion = this.store.gameVersion;
        groupIndex.archiveKey = archive.numericKey;
        groupIndex.name = name;
        groupIndex.nameHash = nameHash;
        groupIndex.version = version;
        groupIndex.size = size;
        groupIndex.crc32 = crc32;
        groupIndex.sha256 = sha256;
        groupIndex.stripes = stripes?.length ? stripes.join(',') : null;
        groupIndex.stripeCount = stripes?.length || 1;
        groupIndex.flatFile = (files?.size === 1 || archive.config.flatten);
        groupIndex.state = state;

        return groupIndex;
    }

    public async saveGroupIndex(group: Group): Promise<GroupIndexEntity> {
        const groupIndex = {
            ...group.index,
            gameVersion: this.store.gameVersion,
            archiveKey: group.archive.numericKey
        };
        delete groupIndex.files;
        return await this.groupRepo.save(groupIndex);
    }

    public async saveGroupIndexes(groups: Group[]): Promise<void> {
        const groupIndexes = groups.map(group => ({
            ...group.index,
            gameVersion: this.store.gameVersion,
            archiveKey: group.archive.numericKey
        }));
        groupIndexes.forEach(g => {
            delete g.files;
        });
        await this.groupRepo.save(groupIndexes, {
            chunk: CHUNK_SIZE, reload: false, transaction: true, listeners: false
        });
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

    public async getFileIndexes(archiveOrGroup: ArchiveIndexEntity | GroupIndexEntity): Promise<FileIndexEntity[]> {
        if(archiveOrGroup instanceof ArchiveIndexEntity) {
            // Return all files for the specified archive

            return await this.fileRepo.find({
                where: {
                    archiveKey: archiveOrGroup.key,
                    gameVersion: this.store.gameVersion
                },
                order: {
                    groupKey: 'ASC',
                    key: 'ASC'
                }
            }) || [];
        } else {
            // Return all files for the specified group

            return await this.fileRepo.find({
                where: {
                    groupKey: archiveOrGroup.key,
                    archiveKey: archiveOrGroup.archiveKey,
                    gameVersion: this.store.gameVersion
                },
                order: {
                    key: 'ASC'
                }
            }) || [];
        }
    }

    public verifyFileIndex(file: FlatFile | Partial<FlatFile>): FileIndexEntity {
        const { numericKey, name, nameHash, version, size, crc32, sha256, stripes, group, archive, state } = file;

        let fileIndex: FileIndexEntity;

        if(file.index) {
            fileIndex = file.index;
        } else {
            fileIndex = new FileIndexEntity();
            fileIndex.key = numericKey;
        }

        fileIndex.gameVersion = this.store.gameVersion;
        fileIndex.archiveKey = archive.numericKey;
        fileIndex.groupKey = group.numericKey;
        fileIndex.name = name;
        fileIndex.nameHash = nameHash;
        fileIndex.version = version;
        fileIndex.size = size;
        fileIndex.crc32 = crc32;
        fileIndex.sha256 = sha256;
        fileIndex.stripes = stripes?.join(',') || String(size);
        fileIndex.stripeCount = fileIndex.stripes?.length || 1;
        fileIndex.state = state;

        return fileIndex;
    }

    public async saveFileIndex(file: FlatFile): Promise<FileIndexEntity> {
        const fileIndex = {
            ...file.index,
            gameVersion: this.store.gameVersion,
            archiveKey: file.archive.numericKey,
            groupKey: file.group.numericKey
        };
        return await this.fileRepo.save(fileIndex);
    }

    public async saveFileIndexes(files: FlatFile[]): Promise<void> {
        const flatFileIndexes = files.map(file => ({
            ...file.index,
            gameVersion: this.store.gameVersion,
            archiveKey: file.archive.numericKey,
            groupKey: file.group.numericKey
        }));

        await this.fileRepo.save(flatFileIndexes, {
            chunk: CHUNK_SIZE, reload: false, transaction: true, listeners: false
        });
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
