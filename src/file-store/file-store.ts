import { ClientFileStore } from '../client-store';
import { logger } from '@runejs/core';
import fs from 'fs';
import { IndexedArchive } from './archive';
import { IndexName } from './index-manifest';
import { ByteBuffer } from '@runejs/core/buffer';


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

    public async generateCrcTable(): Promise<ByteBuffer> {
        if(!this.indexedArchives.size) {
            await this.loadStoreArchives();
        }

        const indexCount = this.indexedArchives.size;
        const buffer = new ByteBuffer(4048);

        buffer.put(0, 'byte');
        buffer.put(indexCount * 6, 'int');

        for(let indexId = 0; indexId < indexCount; indexId++) {
            const indexedArchive = this.indexedArchives.get(indexId);
            const crc = indexedArchive.manifest.crc;
            logger.info(`Index ${indexId} CRC = ${crc}`);
            buffer.put(crc, 'int');
        }

        return buffer.flipWriter();
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
