import { join } from 'path';
import { existsSync, mkdirSync } from 'graceful-fs';
import { Connection, ConnectionOptions, createConnection, Repository } from 'typeorm';

import { logger } from '@runejs/common';

import { Archive, FlatFile, Group, Store } from '../fs';
import { StoreIndexEntity, ArchiveIndexEntity, GroupIndexEntity, FileIndexEntity } from './index';


const CHUNK_SIZE = 250;


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
            type: 'sqlite',
            database: join(indexPath, `index_${this.store.gameVersion}.sqlite3`),
            entities: [ StoreIndexEntity, ArchiveIndexEntity, GroupIndexEntity, FileIndexEntity ],
            synchronize: true,
            logging: [ 'error' ],
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
        const storeIndex = (await this.getStoreIndex()) ?? new StoreIndexEntity();

        if(!storeIndex.gameVersion) {
            storeIndex.gameVersion = this.store.gameVersion;
        }

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
            }
        }) || [];
    }

    public verifyArchiveIndex(archive: Archive | Partial<Archive>): ArchiveIndexEntity {
        const { numericKey, name, nameHash, version, size, crc32, sha256 } = archive;

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

        let groups: GroupIndexEntity[];

        if(existingIndex) {
            groups = new Array(...(existingIndex.groups ?? []));
            delete existingIndex.groups;

            const { name, nameHash, size, sha256, crc32, version, data } = archiveIndex;
            existingIndex.name = name;
            existingIndex.nameHash = nameHash;
            existingIndex.size = size;
            existingIndex.sha256 = sha256;
            existingIndex.crc32 = crc32;
            existingIndex.version = version;
            existingIndex.data = data;

            const result = await this.archiveRepo.update({
                key: archiveIndex.key,
                gameVersion: archiveIndex.gameVersion
            }, existingIndex);

            if(!result.affected) {
                throw new Error(`Error updating archive ${archiveIndex.name} index.`);
            }
        } else {
            groups = new Array(...archiveIndex.groups);
            delete archiveIndex.groups;

            const result = await this.archiveRepo.insert(archiveIndex);

            if(!result.identifiers?.length) {
                throw new Error(`Error updating archive ${archiveIndex.name} index.`);
            }
        }

        logger.info(`Archive ${archiveIndex.name} index saved.`);

        const savedIndex = await this.getArchiveIndex(archiveIndex.key);

        if(!savedIndex?.groups?.length) {
            savedIndex.groups = groups ?? [];
        }

        return savedIndex;
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
        const { numericKey, name, nameHash, version, size, crc32, sha256, stripeCount, archive } = group;

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

        if(group.files?.size === 1) {
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
        delete groupIndex.files;
        return await this.groupRepo.save(groupIndex);
    }

    public async saveGroupIndexes(groupIndexes: GroupIndexEntity[]): Promise<GroupIndexEntity[]> {
        groupIndexes.forEach(idx => delete idx.files);
        return await this.groupRepo.save(groupIndexes, { chunk: CHUNK_SIZE });
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
        const { numericKey, name, nameHash, version, size, crc32, sha256, stripes, group, archive } = file;

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

        return fileIndex;
    }

    public async saveFileIndex(fileIndex: FileIndexEntity): Promise<FileIndexEntity> {
        return await this.fileRepo.save(fileIndex);
    }

    public async saveFileIndexes(fileIndexes: FileIndexEntity[]): Promise<FileIndexEntity[]> {
        return await this.fileRepo.save(fileIndexes, { chunk: CHUNK_SIZE });
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
