import { Connection, ConnectionOptions, createConnection, Repository } from 'typeorm';
import path from 'path';
import { Archive, FlatFile, Group, Store } from '../fs';
import { logger } from '@runejs/common';
import { ArchiveIndexEntity, GroupIndexEntity, FileIndexEntity } from './index';
import { StoreIndexEntity } from './store-index.entity';


export class IndexRepository {

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
            logging: 'all'
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

    public async saveArchiveIndex(archive: Archive): Promise<ArchiveIndexEntity | null> {
        const { numericKey, name, nameHash, version, size, crc32, sha256 } = archive;

        let archiveIndex = await this.getArchiveIndex(archive);
        if(!archiveIndex) {
            archiveIndex = new ArchiveIndexEntity();
            archiveIndex.key = numericKey;
            archiveIndex.gameVersion = this.store.gameVersion;
        }

        archiveIndex.name = name;
        archiveIndex.nameHash = nameHash;
        archiveIndex.version = version;
        archiveIndex.size = size;
        archiveIndex.crc32 = crc32;
        archiveIndex.sha256 = sha256;

        let savedIndex: ArchiveIndexEntity;

        if(!archiveIndex.created) {
            savedIndex = await this.archiveRepo.save(archiveIndex);
        } else {
            await this.archiveRepo.update({
                key: archive.numericKey,
                gameVersion: this.store.gameVersion
            }, archiveIndex);

            savedIndex = await this.getArchiveIndex(archive);
        }

        if(savedIndex?.key !== numericKey) {
            logger.error(`Error saving archive index ${ numericKey }.`);
            return null;
        }

        return savedIndex;
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

    public async saveGroupIndex(group: Group): Promise<GroupIndexEntity | null> {
        const { numericKey, name, nameHash, version, size, crc32, sha256, stripeCount, archive } = group;

        const groupIndex = new GroupIndexEntity();
        groupIndex.key = numericKey;
        groupIndex.name = name;
        groupIndex.nameHash = nameHash;
        groupIndex.version = version;
        groupIndex.size = size;
        groupIndex.crc32 = crc32;
        groupIndex.sha256 = sha256;
        groupIndex.stripeCount = stripeCount;
        groupIndex.archiveKey = archive.numericKey;
        groupIndex.gameVersion = this.store.gameVersion;

        const savedIndex = await this.groupRepo.save(groupIndex);
        if(savedIndex?.key !== numericKey) {
            logger.error(`Error saving file group index ${numericKey}.`);
            return null;
        }

        return savedIndex;
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

    public async saveFileIndex(file: FlatFile): Promise<FileIndexEntity | null> {
        const { numericKey, name, nameHash, version, size, crc32, sha256, stripes, group } = file;

        const fileIndex = new FileIndexEntity();
        fileIndex.key = numericKey;
        fileIndex.name = name;
        fileIndex.nameHash = nameHash;
        fileIndex.version = version;
        fileIndex.size = size;
        fileIndex.crc32 = crc32;
        fileIndex.sha256 = sha256;
        fileIndex.stripes = stripes.join(',');
        fileIndex.groupKey = group.numericKey;
        fileIndex.gameVersion = this.store.gameVersion;

        const savedIndex = await this.fileRepo.save(fileIndex);
        if(savedIndex?.key !== numericKey) {
            logger.error(`Error saving flat file index ${numericKey}.`);
            return null;
        }

        return savedIndex;
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
