import { ClientFileStore } from '../client-store';
import { logger } from '@runejs/core';
import fs from 'fs';
import { IndexedArchive } from './archive';
import { IndexName } from './index-manifest';


export class FileStore {

    public fileStorePath: string;
    public indexedArchives: Map<number, IndexedArchive> = new Map();

    private clientFileStore: ClientFileStore | undefined;

    public constructor(fileStorePath?: string) {
        this.fileStorePath = fileStorePath ?? './stores';
    }

    public async loadStoreArchive(indexId: number, indexName: IndexName): Promise<IndexedArchive> {
        const indexedArchive = new IndexedArchive(this, indexId, indexName);
        this.indexedArchives.set(indexId, indexedArchive);
        await indexedArchive.loadArchive();
        return indexedArchive;
    }

    public async generateCrcTable(): Promise<void> {
        if(!this.indexedArchives.size) {
            await this.loadStoreArchives();
        }

        const indexCount = this.indexedArchives.size;

        for(let i = 0; i < indexCount; i++) {

        }

        /*const promiseList: Promise<void | ByteBuffer>[] = new Array(this.indexedArchives.size);

        this.indexedArchives.forEach((archive, index) =>
            promiseList[index] = archive.unpack());

        await Promise.all(promiseList);

        this.indexedArchives.forEach((archive, index) =>
            promiseList[index] = archive.compress());

        await Promise.all(promiseList);*/
    }

    public async loadStoreArchives(): Promise<void> {
        const promises = [];
        const archiveFiles = fs.readdirSync(this.fileStorePath);
        for(const archivePath of archiveFiles) {
            if(!archivePath || archivePath.indexOf('.zip') === -1) {
                continue;
            }

            try {
                const [ indexIdStr, indexName ] = archivePath
                    .replace('.zip', '').split('_');
                const indexId = parseInt(indexIdStr, 10);

                const indexedArchive = new IndexedArchive(this, indexId, indexName);
                this.indexedArchives.set(indexId, indexedArchive);
                promises.push(indexedArchive.loadArchive());
            } catch(e) {
                logger.error(`Error loading indexed archive ${archivePath}`);
                logger.error(e);
            }
        }

        await Promise.all(promises);
    }

}
