import { ConnectionOptions, createConnection } from 'typeorm';
import path from 'path';
import { Archive, FlatFile, Group, Store } from '../fs';
import { logger } from '@runejs/common';
import { ArchiveIndexEntity, GroupIndexEntity, FileIndexEntity } from './index';


export class Indexer {

    public readonly store: Store;

    public constructor(store: Store) {
        this.store = store;
    }

    public async saveArchiveIndex(archive: Archive): Promise<void> {
        const connection = await createConnection(this.connectionOptions(archive));
        // @TODO
    }

    public async saveGroupIndex(group: Group): Promise<void> {
        const connection = await createConnection(this.connectionOptions(group.archive));
        // @TODO
    }

    public async saveFileIndex(file: FlatFile): Promise<FileIndexEntity | null> {
        const connection = await createConnection(this.connectionOptions(file.archive));

        // @TODO set group & groupKey

        const fileRepository = connection.getRepository(FileIndexEntity);

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

        // fileIndex.group = this.getGroupIndex(group);

        const savedIndex = await fileRepository.save(fileIndex);
        if(savedIndex?.key !== numericKey) {
            logger.error(`Error saving flat file ${numericKey}.`);
            return null;
        }

        return savedIndex;
    }

    public async loadArchiveIndex(archive: Archive): Promise<ArchiveIndexEntity | null> {
        const connection = await createConnection(this.connectionOptions(archive));
        const archiveRepository = connection.getRepository(ArchiveIndexEntity);

        const archiveIndex = await archiveRepository.findOne({
            where: {
                name: archive.name
            }
        });

        if(!archiveIndex) {
            logger.error(`Index data not found for archive ${archive.name}.`);
            return null;
        }

        console.log(JSON.stringify(archiveIndex, null, 2));
        return archiveIndex;
    }

    private connectionOptions(archive: Archive): ConnectionOptions {
        return {
            type: 'sqlite',
            database: path.join(this.store.path, 'archives', archive.name, 'index.sqlite'),
            entities: [ ArchiveIndexEntity, GroupIndexEntity, FileIndexEntity ],
            synchronize: true,
            logging: false
        };
    }

}
