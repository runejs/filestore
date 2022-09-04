import { join } from 'path';
import { existsSync, readdirSync, readFileSync, statSync } from 'graceful-fs';
import { Buffer } from 'buffer';
import { logger } from '@runejs/common';
import { ByteBuffer } from '@runejs/common/buffer';
import { Bzip2, Gzip } from '@runejs/common/compress';
import { JagFileStore } from './jag-file-store';
import { JagFile } from './jag-file';
import { JagArchive } from './jag-archive';
import { JagFileBase } from './jag-file-base';
import { PackedCacheFile } from '../packed';


const dataFileName = 'main_file_cache.dat';
const indexFileNamePrefix = 'main_file_cache.idx';


export const caches = {
    archives: 0,
    models: 1,
    animations: 2,
    midi: 3,
    maps: 4,
};


export const archives = {
    'empty.jag': 0,
    'title.jag': 1,
    'config.jag': 2,
    'interface.jag': 3,
    'media.jag': 4,
    'versionlist.jag': 5,
    'textures.jag': 6,
    'wordenc.jag': 7,
    'sounds.jag': 8,
};


export interface JagFileIndex {
    fileSize: number;
    sectorNumber: number;
}


export interface JagSectorHeader {
    fileKey: number;
    filePartNumber: number;
    sectorNumber: number;
    cacheKey: number;
}


export class Jag {

    readonly jagStore: JagFileStore;

    private indexFiles: Map<number, ByteBuffer>;
    private dataFile: ByteBuffer;

    constructor(jagStore: JagFileStore) {
        this.jagStore = jagStore;
        this.indexFiles = new Map<number, ByteBuffer>();
    }

    readOpenRS2PackedCacheFiles(cacheFiles: PackedCacheFile[]): void {
        const dataFileBuffer = cacheFiles.find(file => file.name === dataFileName)?.data || null;
        if (!dataFileBuffer?.length) {
            throw new Error(`The main ${ dataFileName } data file could not be found.`);
        }

        this.dataFile = new ByteBuffer(dataFileBuffer);
        this.indexFiles.clear();

        for (const cacheFile of cacheFiles) {
            const fileName = cacheFile?.name;

            if (!fileName?.length || fileName === dataFileName) {
                continue;
            }

            if (!fileName.startsWith(indexFileNamePrefix)) {
                continue;
            }

            if (!cacheFile?.data?.length) {
                logger.error(`Index file ${ fileName } is empty!`);
                continue;
            }

            const indexString = fileName.substring(fileName.indexOf('.idx') + 4);
            const indexKey = Number(indexString);

            if (isNaN(indexKey)) {
                logger.error(`Index file ${ fileName } does not have a valid extension.`);
            }

            this.indexFiles.set(indexKey, new ByteBuffer(cacheFile.data));
            this.jagStore.createCache(indexKey);
        }

        logger.info(`JAG store files loaded for game build ${this.jagStore.gameBuild}.`);
    }

    readLocalPackedCacheFiles(): void {
        const jagStorePath = join(this.jagStore.fileStorePath, 'jag');

        if (!existsSync(jagStorePath)) {
            throw new Error(`${jagStorePath} could not be found.`);
        }

        const stats = statSync(jagStorePath);
        if (!stats?.isDirectory()) {
            throw new Error(`${jagStorePath} is not a valid directory.`);
        }

        const storeFileNames = readdirSync(jagStorePath);
        const dataFileName = 'main_file_cache.dat';

        if (storeFileNames.indexOf(dataFileName) === -1) {
            throw new Error(`The main ${dataFileName} data file could not be found.`);
        }

        const indexFilePrefix = 'main_file_cache.idx';
        const dataFilePath = join(jagStorePath, dataFileName);

        this.dataFile = new ByteBuffer(readFileSync(dataFilePath));
        this.indexFiles = new Map<number, ByteBuffer>();

        for (const fileName of storeFileNames) {
            if (!fileName?.length || fileName === dataFileName) {
                continue;
            }

            if (!fileName.startsWith(indexFilePrefix)) {
                continue;
            }

            const indexString = fileName.substring(fileName.indexOf('.idx') + 4);
            const indexKey = Number(indexString);

            if (isNaN(indexKey)) {
                logger.error(`Index file ${fileName} does not have a valid extension.`);
            }

            this.indexFiles.set(indexKey, new ByteBuffer(readFileSync(join(jagStorePath, fileName))));
            this.jagStore.createCache(indexKey);
        }

        logger.info(`JAG store files loaded for game build ${this.jagStore.gameBuild}.`);
    }

    decodeCache(indexName: string): void {
        logger.info(`Decoding JAG cache index ${indexName}...`);

        const cacheKey = caches[indexName];
        const indexFile = this.indexFiles.get(cacheKey);
        const fileCount = indexFile.length / 6;

        logger.info(`${fileCount} file indexes found.`);

        const cache = this.jagStore.getCache(cacheKey);
        cache.fileIndexes = new Array(fileCount);
        cache.index.childCount = fileCount;
        cache.index.compressionMethod = 'none';
        cache.data.buffer = indexFile.toNodeBuffer();

        for (let fileKey = 0; fileKey < fileCount; fileKey++) {
            const fileSize = indexFile.get('int24', 'unsigned');
            const sectorPos = indexFile.get('int24', 'unsigned');
            cache.fileIndexes[fileKey] = {
                fileSize, sectorNumber: sectorPos
            };

            let file: JagFileBase;

            if (indexName === 'archives') {
                file = new JagArchive(this.jagStore, fileKey);
            } else {
                file = new JagFile(this.jagStore, fileKey, cacheKey);
            }

            cache.files.set(fileKey, file);
        }

        cache.validate(false);

        logger.info(`Cache index ${indexName} has been decoded.`);
    }

    unpack(file: JagArchive | JagFile): Buffer | null {
        const fileIndexData = this.jagStore.getCache(file.index.cacheKey);
        const { fileSize, sectorNumber } = fileIndexData.fileIndexes[file.index.key];
        const fileData = new ByteBuffer(fileSize);
        const sectorDataLength = 512;
        const sectorLength = 520;
        let remainingData = fileSize;
        let currentSectorNumber = sectorNumber;
        let cycles = 0;

        while (remainingData > 0) {
            let readableSectorData = sectorLength;
            let remaining = this.dataFile.readable - currentSectorNumber * sectorLength;

            if (remaining < sectorLength) {
                readableSectorData = remaining;
            }

            const block = this.dataFile.getSlice(currentSectorNumber * sectorLength, readableSectorData);

            const sectorFileKey = block.get('short', 'unsigned');
            const sectorFilePartNumber = block.get('short', 'unsigned');
            const sectorNumber = block.get('int24', 'unsigned');
            const sectorCacheKey = block.get('byte', 'unsigned');

            readableSectorData -= 8;

            let bytesThisCycle = remainingData;

            if (bytesThisCycle > sectorDataLength) {
                bytesThisCycle = sectorDataLength;
            }

            block.copy(
                fileData,
                fileData.writerIndex,
                block.readerIndex,
                block.readerIndex + readableSectorData
            );

            fileData.writerIndex = fileData.writerIndex + bytesThisCycle;
            remainingData -= bytesThisCycle;

            if (cycles !== sectorFilePartNumber) {
                logger.error(`Error extracting JAG file ${ file.index.key }, file data is corrupted.`);
                return null;
            }

            if (remainingData > 0) {
                // saved index keys have 1 added to them for some reason
                if (sectorCacheKey !== file.index.cacheKey + 1) {
                    logger.error(`Index key mismatch, expected cache ${ file.index.cacheKey } but found ${ sectorCacheKey }`);
                    return null;
                }

                if (sectorFileKey !== file.index.key) {
                    logger.error(`File index mismatch, expected ${ file.index.key } but found ${ sectorFileKey }.`);
                    return null;
                }
            }

            cycles++;
            currentSectorNumber = sectorNumber;
        }

        if (!(file instanceof JagArchive)) {
            file.index.compressionMethod = 'gzip';
        }

        if (fileData.length) {
            file.compressedData.buffer = fileData.toNodeBuffer();

            if (!(file instanceof JagArchive)) {
                file.data.buffer = Gzip.decompress(fileData);
            }
        } else {
            file.compressedData.buffer = null;
            file.index.fileError = 'FILE_MISSING';
        }

        if (!(file instanceof JagArchive)) {
            file.validate(false);
        }

        return file.compressedData.buffer;
    }

    decodeArchive(archive: JagArchive): Buffer | null {
        if (!archive.compressedData?.buffer?.length) {
            return null;
        }

        let archiveData = new ByteBuffer(archive.compressedData.buffer);

        const uncompressed = archiveData.get('int24', 'unsigned');
        const compressed = archiveData.get('int24', 'unsigned');

        if (uncompressed !== compressed) {
            const compressedData = archiveData.getSlice(archiveData.readerIndex, archiveData.length - archiveData.readerIndex);
            const decompressedData = Bzip2.decompress(compressedData);
            archiveData = new ByteBuffer(decompressedData);
            archive.data.buffer = decompressedData;
            archive.index.compressionMethod = 'bzip2';
        } else {
            archive.data.buffer = archiveData.toNodeBuffer();
            archive.index.compressionMethod = 'none';
        }

        const fileCount = archiveData.get('short', 'unsigned');
        archive.index.childCount = fileCount;
        archive.files.clear();

        const fileDataOffsets: number[] = new Array(fileCount);
        let fileDataOffset = archiveData.readerIndex + fileCount * 10;

        // Read archive file headers
        for (let fileKey = 0; fileKey < fileCount; fileKey++) {
            const fileNameHash = archiveData.get('int');
            const fileName = this.jagStore.nameHasher.findFileName(fileNameHash);
            const decompressedFileLength = archiveData.get('int24', 'unsigned');
            const compressedFileLength = archiveData.get('int24', 'unsigned');
            fileDataOffsets[fileKey] = fileDataOffset;
            fileDataOffset += compressedFileLength;

            const file = new JagFile(this.jagStore, fileKey, archive.index.cacheKey, archive.index.key);
            file.index.nameHash = fileNameHash;
            file.index.name = fileName;
            file.index.fileSize = decompressedFileLength;
            file.index.compressedFileSize = compressedFileLength;

            archive.files.set(fileKey, file);
        }

        // Read archive file data
        for (const [ fileKey, file ] of archive.files) {
            try {
                const fileDataOffset = fileDataOffsets[fileKey];
                const fileData = Buffer.alloc(file.index.compressedFileSize);
                archiveData.copy(fileData, 0, fileDataOffset);
                file.compressedData.buffer = fileData;
            } catch (error) {
                logger.error(`Error reading archive ${archive.index.name } file ${fileKey}`, error);
            }
        }

        // Decompress archive file data (if needed)
        for (const [ fileKey, file ] of archive.files) {
            try {
                const { compressedFileSize, fileSize } = file.index;
                if (file.compressedData?.buffer?.length && compressedFileSize !== fileSize) {
                    file.data.buffer = Bzip2.decompress(file.compressedData.buffer);
                    file.index.compressionMethod = 'bzip2';
                } else {
                    file.data.buffer = file.compressedData.buffer;
                    file.index.compressionMethod = 'none';
                }
            } catch (error) {
                logger.error(`Error decompressing archive ${archive.index.name } file ${fileKey}`, error);
            }
        }

        // Validate each file
        for (const [ , file ] of archive.files) {
            file.validate(false);
        }

        archive.validate(false);

        return archive.data.buffer;
    }

}
