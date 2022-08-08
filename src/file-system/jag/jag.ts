import { join } from 'path';
import { existsSync, readdirSync, readFileSync, statSync } from 'graceful-fs';
import { ByteBuffer, logger } from '@runejs/common';
import { JagFileStore } from './jag-file-store';
import { JagFile } from './jag-file';
import { Buffer } from 'buffer';
import { JagArchive } from './jag-archive';
import { decompressHeadlessBzip2 } from '../../compress';
import { JagFileBase } from './jag-file-base';
import { CacheFile } from '../cache';


const dataFileName = 'main_file_cache.dat';
const indexFileNamePrefix = 'main_file_cache.idx';


export const indexes = {
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
    indexKey: number;
}


export class Jag {

    readonly jagStore: JagFileStore;

    private indexFiles: Map<number, ByteBuffer>;
    private dataFile: ByteBuffer;

    constructor(jagStore: JagFileStore) {
        this.jagStore = jagStore;
        this.indexFiles = new Map<number, ByteBuffer>();
    }

    readOpenRS2CacheFiles(cacheFiles: CacheFile[]): void {
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
            this.jagStore.createIndex(indexKey);
        }

        logger.info(`JAG store files loaded for game build ${this.jagStore.gameBuild}.`);
    }

    readLocalCacheFiles(): void {
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
            this.jagStore.createIndex(indexKey);
        }

        logger.info(`JAG store files loaded for game build ${this.jagStore.gameBuild}.`);
    }

    decodeIndex(indexName: string): void {
        logger.info(`Decoding JAG index ${indexName}...`);

        const indexKey = indexes[indexName];
        const indexFile = this.indexFiles.get(indexKey);
        const fileCount = indexFile.length / 6;

        logger.info(`${fileCount} file indexes found.`);

        const index = this.jagStore.getIndex(indexKey);
        index.fileIndexes = new Array(fileCount);

        for (let fileKey = 0; fileKey < fileCount; fileKey++) {
            const fileSize = indexFile.get('int24', 'unsigned');
            const sectorPos = indexFile.get('int24', 'unsigned');
            index.fileIndexes[fileKey] = {
                fileSize, sectorNumber: sectorPos
            };

            let file: JagFileBase;

            if (indexName === 'archives') {
                file = new JagArchive(this.jagStore, fileKey);
            } else {
                file = new JagFile(this.jagStore, fileKey, indexKey);
            }

            index.files.set(fileKey, file);
        }

        logger.info(`Index ${indexName} has been loaded.`);
    }

    unpack(file: JagArchive | JagFile): Buffer | null {
        const fileIndexData = this.jagStore.getIndex(file.index.indexKey);
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
            const sectorIndexKey = block.get('byte', 'unsigned');

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
                if (sectorIndexKey !== file.index.indexKey + 1) {
                    logger.error(`Index key mismatch, expected index ${ file.index.indexKey } but found ${ sectorIndexKey }`);
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

        if (fileData.length) {
            file.index.compressedData = fileData.toNodeBuffer();
        } else {
            file.index.compressedData = null;
            file.index.fileError = 'FILE_MISSING';
        }

        file.validate(false);

        return file.index.compressedData;
    }

    decodeArchive(archive: JagArchive): Buffer | null {
        if (!archive.index.compressedData?.length) {
            return null;
        }

        let archiveData = new ByteBuffer(archive.index.compressedData);

        const uncompressed = archiveData.get('int24', 'unsigned');
        const compressed = archiveData.get('int24', 'unsigned');

        if (uncompressed !== compressed) {
            const compressedData = archiveData.getSlice(archiveData.readerIndex, archiveData.length - archiveData.readerIndex);
            archiveData = new ByteBuffer(decompressHeadlessBzip2(compressedData));
            archive.index.compressionMethod = 'bzip';
        } else {
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

            const file = new JagFile(this.jagStore, fileKey, archive.index.indexKey, archive.index.key);
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
                file.index.compressedData = fileData;
            } catch (error) {
                logger.error(`Error reading archive ${archive.index.name } file ${fileKey}`, error);
            }
        }

        // Decompress archive file data (if needed)
        for (const [ fileKey, file ] of archive.files) {
            try {
                const { compressedFileSize, fileSize, compressedData } = file.index;
                if (compressedData?.length && compressedFileSize !== fileSize) {
                    file.index.data = decompressHeadlessBzip2(file.index.compressedData);
                    file.index.compressionMethod = 'bzip';
                } else {
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

        if (archiveData.length) {
            archive.index.data = archiveData.toNodeBuffer();
        }

        archive.validate(false);

        return archive.index.data;
    }

}
