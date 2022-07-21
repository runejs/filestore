import { join } from 'path';
import { existsSync, readdirSync, readFileSync, statSync } from 'graceful-fs';
import { ByteBuffer, logger } from '@runejs/common';
import { JagStore } from './jag-store';
import { OpenRS2CacheFile } from '../../openrs2';


export class Jag {

    readonly jagStore: JagStore;

    private indexFiles: Map<number, ByteBuffer>;
    private dataFile: ByteBuffer;

    constructor(jagStore: JagStore) {
        this.jagStore = jagStore;
    }

    // @todo stubbed - 21/07/22 - Kiko
    readOpenRS2CacheFiles(cacheFiles: OpenRS2CacheFile[]): void {
    }

    readLocalJagFiles(): void {
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
        }

        logger.info(`JAG store files loaded for game build ${this.jagStore.gameBuild}.`);
    }

    // @todo 18/07/22 - Kiko

}
