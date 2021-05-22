import { Archive, ClientFileStore, getFileName} from '../client-store';
import { logger } from '@runejs/core';
import JSZip from 'jszip';
import fs from 'fs';
import { IndexedArchive } from './indexed-archive';
import { fileExtensions, IndexName } from './index-manifest';


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
