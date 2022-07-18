import { join } from 'path';
import { existsSync, readdirSync, readFileSync, statSync } from 'graceful-fs';
import { ByteBuffer, logger } from '@runejs/common';
import { JagStore } from './jag-store';


export class Jag {

    readonly jagStore: JagStore;

    private indexFiles: Map<number, ByteBuffer>;
    private dataFile: ByteBuffer;

    constructor(jagStore: JagStore) {
        this.jagStore = jagStore;
    }

    loadJagFiles(): void {
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

            const index = fileName.substring(fileName.indexOf('.idx') + 4);
            const numericIndex = Number(index);

            if (isNaN(numericIndex)) {
                logger.error(`Index file ${fileName} does not have a valid extension.`);
            }

            this.indexFiles.set(numericIndex, new ByteBuffer(readFileSync(join(jagStorePath, fileName))));
        }

        logger.info(`Jag store files loaded for game build ${this.jagStore.gameBuild}.`);
    }

    // @todo 18/07/22 - Kiko

}
