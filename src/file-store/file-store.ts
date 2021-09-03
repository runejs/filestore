import { logger } from '@runejs/core';
import fs from 'fs';
import {
    archiveConfig,
    ArchiveName,
    getArchiveIndex,
    getArchiveName,
    IndexedArchive
} from './archive';
import { ByteBuffer } from '@runejs/core/buffer';


export class FileStore {

    public fileStorePath: string;
    public indexedArchives: Map<number, IndexedArchive> = new Map();

    public constructor(fileStorePath?: string) {
        this.fileStorePath = fileStorePath ?? '../stores';
    }

    public async getAllArchives(): Promise<Map<number, IndexedArchive>> {
        if(this.indexedArchives.size === 0) {
            await this.loadAllArchives();
        }
        return this.indexedArchives;
    }

    public getArchive(archiveIndex: number): IndexedArchive;
    public getArchive(archiveName: ArchiveName): IndexedArchive;
    public getArchive(archiveKey: number | ArchiveName): IndexedArchive;
    public getArchive(archiveKey: number | ArchiveName): IndexedArchive {
        let indexName: ArchiveName;
        if(typeof archiveKey !== 'number') {
            indexName = archiveKey;
            archiveKey = archiveConfig[indexName].index;
        }

        if(this.indexedArchives.has(archiveKey)) {
            return this.indexedArchives.get(archiveKey);
        } else {
            return this.loadArchive(archiveKey);
        }
    }

    public async getFile(archiveIndex: number, fileIndex: number, compressed: boolean = true): Promise<ByteBuffer | null> {
        if(!this.indexedArchives.has(archiveIndex)) {
            await this.loadArchive(archiveIndex);
        }

        const archive = this.indexedArchives.get(archiveIndex);
        const loadedFile = archive.getGroup(fileIndex);

        if(loadedFile) {
            if(compressed && loadedFile.fileDataCompressed) {
                return loadedFile.fileData ?? null;
            }

            if(!compressed && loadedFile.fileData) {
                return loadedFile.fileData ?? null;
            }
        }

        const file = await archive.loadFile(fileIndex, true);

        if(!file) {
            return null;
        }

        if(compressed) {
            return await file.compress();
        } else {
            return file.fileData;
        }
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

    public async generateMainIndexFile(): Promise<ByteBuffer> {
        if(!this.indexedArchives.size) {
            await this.loadAllArchives();
        }

        const indexCount = this.indexedArchives.size;
        const crcTableFileSize = 78;
        const buffer = new ByteBuffer(4096);

        buffer.put(0, 'byte'); // compression level (none)
        buffer.put(crcTableFileSize, 'int'); // file size

        for(let indexId = 0; indexId < indexCount; indexId++) {
            const indexedArchive = this.indexedArchives.get(indexId);
            const crc = indexedArchive.manifest.crc;
            buffer.put(crc, 'int');
        }

        return buffer;
    }

    public loadArchive(archiveIndex: number): IndexedArchive;
    public loadArchive(archiveName: ArchiveName): IndexedArchive;
    public loadArchive(archiveKey: number | ArchiveName): IndexedArchive;
    public loadArchive(archiveKey: number | ArchiveName): IndexedArchive {
        let archiveIndex: number;
        let archiveName: ArchiveName;
        if(typeof archiveKey === 'number') {
            archiveIndex = archiveKey;
            archiveName = getArchiveName(archiveIndex);
        } else {
            archiveName = archiveKey;
            archiveIndex = getArchiveIndex(archiveName);
        }

        const indexedArchive = new IndexedArchive(this, archiveIndex, archiveName);
        this.indexedArchives.set(archiveIndex, indexedArchive);
        indexedArchive.loadManifestFile();
        return indexedArchive;
    }

    public async loadAllArchives(): Promise<void> {
        const promises = [];
        const archiveFiles = fs.readdirSync(this.fileStorePath);
        for(const archivePath of archiveFiles) {
            if(!archivePath) {
                continue;
            }

            try {
                const indexName = archivePath.replace('/', '');
                const indexId = archiveConfig[indexName].index;

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
