import { join } from 'path';
import { existsSync, mkdirSync } from 'graceful-fs';
import { Connection, createConnection, Repository } from 'typeorm';

import { logger } from '@runejs/common';

import { Archive, ArchiveFormat, FileState, FlatFile, Group, IndexedFile, IndexEntity, Store } from '../index';
import { ArchiveIndexEntity, FileIndexEntity, GroupIndexEntity, StoreIndexEntity } from './index';


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
            database: join(indexPath, `index_${this.store.gameBuild}.sqlite3`),
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
                gameBuild: this.store.gameBuild
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

        if(!storeIndex.gameBuild) {
            storeIndex.gameBuild = this.store.gameBuild;
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
                gameBuild: this.store.gameBuild
            }, storeIndex);

            if(!updateResult?.affected) {
                logger.error(`Main store entity update failed.`);
                return null;
            }

            savedIndex = await this.getStoreIndex();
        } else {
            savedIndex = await this.storeRepo.save(storeIndex);
        }

        if(savedIndex?.gameBuild !== this.store.gameBuild) {
            logger.error(`Error saving store index ${this.store.gameBuild}.`);
            return null;
        }

        logger.info(`Store index ${this.store.gameBuild} saved.`);

        return savedIndex;
    }

    public async getArchiveIndex(archive: Archive): Promise<ArchiveIndexEntity | null>;
    public async getArchiveIndex(archiveKey: number): Promise<ArchiveIndexEntity | null>;
    public async getArchiveIndex(archive: Archive | number): Promise<ArchiveIndexEntity | null> {
        const key = typeof archive === 'number' ? archive : archive.numericKey;
        return await this.archiveRepo.findOne({
            where: {
                key, gameBuild: this.store.gameBuild
            },
            relations: [ 'groups' ]
        }) || null;
    }

    public async getArchiveIndexes(): Promise<ArchiveIndexEntity[]> {
        return await this.archiveRepo.find({
            where: {
                gameBuild: this.store.gameBuild
            },
            order: {
                key: 'ASC'
            }
        }) || [];
    }

    public validateArchive(archive: Archive | Partial<Archive>): ArchiveIndexEntity {
        const archiveIndex: ArchiveIndexEntity = archive.index ? archive.index : new ArchiveIndexEntity();
        if(!archive.index) {
            archive.index = archiveIndex;
        }

        this.updateEntityIndex(archive);

        archiveIndex.format = archiveIndex.format || ArchiveFormat.original;
        archiveIndex.version = archiveIndex.version || 0;
        archiveIndex.gameBuild = this.store.gameBuild;
        archiveIndex.state = archive.state || FileState.unloaded;
        archiveIndex.groupCount = archive.groups?.size ?? 0;

        return archiveIndex;
    }

    public async saveArchiveIndex(archive: Archive): Promise<ArchiveIndexEntity> {
        const archiveIndex = archive.index;
        const existingIndex = await this.archiveRepo.findOne({
            where: {
                key: archiveIndex.key,
                gameBuild: this.store.gameBuild
            }
        });

        let affected;

        if(existingIndex) {
            const { name, size, version, sha256, crc32, data, state } = archiveIndex;
            existingIndex.name = name;
            existingIndex.size = size;
            existingIndex.version = version;
            existingIndex.sha256 = sha256;
            existingIndex.crc32 = crc32;
            existingIndex.data = data;
            existingIndex.state = state;

            delete existingIndex.groups;

            const result = await this.archiveRepo.update({
                key: archiveIndex.key,
                gameBuild: this.store.gameBuild
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
                gameBuild: this.store.gameBuild
            }
        }) || null;
    }

    public async getGroupIndexes(archive: ArchiveIndexEntity): Promise<GroupIndexEntity[]> {
        return await this.groupRepo.find({
            where: {
                archiveKey: archive.key,
                gameBuild: this.store.gameBuild
            },
            order: {
                key: 'ASC'
            }
        }) || [];
    }

    public validateGroup(group: Group | Partial<Group>): GroupIndexEntity {
        const { stripes, archive, files } = group;

        const groupIndex: GroupIndexEntity = group.index ? group.index : new GroupIndexEntity();
        if(!group.index) {
            group.index = groupIndex;
        }

        this.updateEntityIndex(group);

        groupIndex.gameBuild = this.store.gameBuild;
        groupIndex.archiveKey = archive.numericKey;
        groupIndex.state = group.state;
        groupIndex.stripes = stripes?.length ? stripes.join(',') : null;
        groupIndex.stripeCount = stripes?.length || 1;
        groupIndex.flatFile = (files?.size === 1 || archive.config.flatten);

        return groupIndex;
    }

    public async saveGroupIndex(group: Group): Promise<void> {
        if(!this.entityModified(group)) {
            return;
        }
        await this.groupRepo.upsert(this.validateGroup(group), []);
    }

    public async saveGroupIndexes(groups: Group[]): Promise<void> {
        const groupIndexes = groups.filter(group => this.entityModified(group))
            .map(group => this.validateGroup(group));

        groupIndexes.forEach(i => delete i.files);

        if(!groupIndexes.length) {
            logger.info(`No groups were modified.`);
        } else {
            await this.groupRepo.save(groupIndexes, {
                chunk: CHUNK_SIZE, reload: false
            });
        }
    }

    public async getFileIndex(file: FlatFile): Promise<FileIndexEntity | null> {
        return await this.fileRepo.findOne({
            where: {
                key: file.numericKey,
                groupKey: file.group.numericKey,
                archiveKey: file.archive.numericKey,
                gameBuild: this.store.gameBuild
            }
        }) || null;
    }

    public async getFileIndexes(archiveOrGroup: ArchiveIndexEntity | GroupIndexEntity): Promise<FileIndexEntity[]> {
        if(archiveOrGroup instanceof ArchiveIndexEntity) {
            // Return all files for the specified archive

            return await this.fileRepo.find({
                where: {
                    archiveKey: archiveOrGroup.key,
                    gameBuild: this.store.gameBuild
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
                    gameBuild: this.store.gameBuild
                },
                order: {
                    key: 'ASC'
                }
            }) || [];
        }
    }

    public validateFile(file: FlatFile | Partial<FlatFile>): FileIndexEntity {
        const { size, stripes, group, archive } = file;

        const fileIndex: FileIndexEntity = file.index ? file.index : new FileIndexEntity();
        if(!file.index) {
            file.index = fileIndex;
        }

        this.updateEntityIndex(file);

        fileIndex.gameBuild = this.store.gameBuild;
        fileIndex.store = this.store.index;
        fileIndex.archiveKey = archive.numericKey;
        fileIndex.archive = archive.index;
        fileIndex.groupKey = group.numericKey;
        fileIndex.group = group.index;
        fileIndex.stripes = stripes?.join(',') || String(size);
        fileIndex.stripeCount = fileIndex.stripes?.length || 1;

        return fileIndex;
    }

    public async saveFileIndex(file: FlatFile): Promise<void> {
        if(!this.entityModified(file)) {
            return;
        }
        await this.fileRepo.upsert(this.validateFile(file), []);
    }

    public async saveFileIndexes(files: FlatFile[]): Promise<void> {
        const flatFileIndexes = files.filter(file => this.entityModified(file))
            .map(file => this.validateFile(file));

        if(!flatFileIndexes.length) {
            logger.info(`No flat files were modified.`);
        } else {
            logger.info(`${flatFileIndexes.length} flat files were modified.`);
            await this.fileRepo.save(flatFileIndexes, {
                chunk: CHUNK_SIZE, reload: false, transaction: false, listeners: false
            });
        }
    }

    public entityModified<T extends IndexEntity>(file: IndexedFile<T> | Partial<IndexedFile<T>>): boolean {
        const index = file.index;

        if(file.numericKey !== index.key || file.name !== index.name) {
            return true;
        }

        if((index instanceof GroupIndexEntity || index instanceof FileIndexEntity) &&
            (file instanceof Group || file instanceof FlatFile)) {
            if(file.nameHash !== index.nameHash || file.version !== index.version) {
                return true;
            }

            if(file.archive.numericKey !== index.archiveKey) {
                return true;
            }
        }

        if((index instanceof ArchiveIndexEntity || index instanceof GroupIndexEntity) &&
            (file instanceof Archive || file instanceof Group)) {
            if(file.state !== index.state) {
                // return true;
            }
        }

        if(index instanceof FileIndexEntity && file instanceof FlatFile) {
            if(file.group.numericKey !== index.groupKey) {
                return true;
            }
        }

        return file.size !== index.size || file.crc32 !== index.crc32 || file.sha256 !== index.sha256;
    }

    public updateEntityIndex<T extends IndexEntity>(file: IndexedFile<T> | Partial<IndexedFile<T>>): T {
        const index = file.index;

        if(!file.name && file.hasNameHash) {
            file.name = file.hasNameHash ?
                this.store.findFileName(file.nameHash, String(file.nameHash)) : file.key;
        } else if(!file.hasNameHash && file.named) {
            file.nameHash = this.store.hashFileName(file.name);
        } else {
            file.nameHash = -1;
        }

        if(index instanceof ArchiveIndexEntity || index instanceof GroupIndexEntity || index instanceof FileIndexEntity) {
            index.version = file.version;

            if(file.modified) {
                index.version = index.version ? index.version + 1 : 1;
            }
        }

        if(index.key === undefined || index.key === null) {
            index.key = file.numericKey;
        }

        if(index.name !== file.name) {
            index.name = file.name;
        }

        let dataModified = false;

        if(index.size !== file.size) {
            index.size = file.size;
            dataModified = true;
        }

        if(index.crc32 !== file.crc32) {
            index.crc32 = file.crc32;
            dataModified = true;
        }

        if(index.sha256 !== file.sha256) {
            index.sha256 = file.sha256;
            dataModified = true;
        }

        if(dataModified || !index.data?.length) {
            index.data = file.data?.length ? Buffer.from(file.data) : null;
        }

        return index;
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
