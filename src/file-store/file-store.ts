import { ClientFileStore } from '../client-store';
import { logger } from '@runejs/core';
import fs from 'fs';
import { IndexedArchive } from './archive';
import { getIndexName, indexIdMap, IndexName } from './index-manifest';
import { ByteBuffer } from '@runejs/core/buffer';
import JSZip from 'jszip';


export class FileStore {

    public fileStorePath: string;
    public indexedArchives: Map<number, IndexedArchive> = new Map();

    public constructor(fileStorePath?: string) {
        this.fileStorePath = fileStorePath ?? './stores';
    }

    public async loadStoreArchive(indexId: number, indexName: IndexName): Promise<IndexedArchive> {
        const indexedArchive = new IndexedArchive(this, indexId, indexName);
        this.indexedArchives.set(indexId, indexedArchive);
        await indexedArchive.loadManifestFile();
        return indexedArchive;
    }

    public async getFile(indexId: number, fileId: number, compressed: boolean = true,
                         zipArchive?: JSZip | any | undefined): Promise<ByteBuffer | null> {
        if(!this.indexedArchives.has(indexId)) {
            await this.loadStoreArchive(indexId, getIndexName(indexId));
        }

        const archive = this.indexedArchives.get(indexId);
        const file = await archive.loadFile(fileId, true, zipArchive);

        if(!file) {
            return null;
        }

        return compressed ? await file.compress() : await file.pack();
    }

    public async generateUpdateServerFile(index: number, file: number, fileBuffer: ByteBuffer): Promise<ByteBuffer> {
        const buffer = new ByteBuffer((fileBuffer.length - 2) + ((fileBuffer.length - 2) / 511) + 8);

        buffer.put(index);
        buffer.put(file, 'short');

        let length: number = ((fileBuffer.at(1, 'u') << 24) + (fileBuffer.at(2, 'u') << 16) +
            (fileBuffer.at(3, 'u') << 8) + fileBuffer.at(4, 'u')) + 9;
        if(fileBuffer.at(0) === 0) {
            length -= 4;
        }

        logger.info(`Requested file length: ${length}`);

        let s = 3;
        for(let i = 0; i < length; i++) {
            if(s === 512) {
                buffer.put(255);
                s = 1;
            }

            const b = fileBuffer.at(i);
            buffer.put(b);
            s++;
        }

        buffer.putBytes(fileBuffer, 0, length);
        return buffer;
    }

    public async generateCrcTable(): Promise<ByteBuffer> {
        if(!this.indexedArchives.size) {
            await this.loadStoreArchives();
        }

        const indexCount = this.indexedArchives.size;
        const crcTableFileSize = 78;
        const buffer = new ByteBuffer(4096);

        buffer.put(0, 'byte'); // compression level (none)
        buffer.put(crcTableFileSize, 'int'); // file size

        for(let indexId = 0; indexId < indexCount; indexId++) {
            const indexedArchive = this.indexedArchives.get(indexId);
            const crc = indexedArchive.manifest.crc;
            logger.info(`Index ${indexId} CRC = ${crc}`);
            buffer.put(crc, 'int');
        }

        return buffer;
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
                promises.push(indexedArchive.loadManifestFile());
            } catch(e) {
                logger.error(`Error loading indexed archive ${archivePath}`);
                logger.error(e);
            }
        }

        await Promise.all(promises);
    }

}
