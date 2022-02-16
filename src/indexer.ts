import { join } from 'path';
import { existsSync, mkdirSync } from 'graceful-fs';
import { logger, setLoggerDest } from '@runejs/common';
import { Store } from './fs';
import { createObject, TerminalInterface, ArgumentMap } from './util';


class IndexerOptions {

    public store: string = '';
    public debug: boolean = false;
    public archive: string = '';
    public version: number = -1;

    public static create(options?: Partial<IndexerOptions>): IndexerOptions {
        return createObject<IndexerOptions>(IndexerOptions, options, true);
    }

}


const indexFiles = async (store: Store, archiveName: string, args: ArgumentMap, debug: boolean): Promise<void> => {
    const argDebugString = args.size !== 0 ? Array.from(args.entries()).map(([ key, val ]) => `${key} = ${val}`).join(', ') : '';
    const outputDir = store.outputPath;

    if(!existsSync(outputDir)) {
        mkdirSync(outputDir, { recursive: true });
    }

    if(archiveName === 'main') {
        logger.info(`Indexing flat file store${args.size !== 0 ? ` with arguments:` : `...`}`);
        if(args.size !== 0) {
            logger.info(argDebugString);
        }

        await store.read(true);
        await Array.from(store.archives.values()).forEachAsync(async archive => await archive.saveIndexData());
    } else {
        logger.info(`Indexing flat file store archive ${archiveName}${args.size !== 0 ? ` with arguments:` : `...`}`);
        if(args.size !== 0) {
            logger.info(argDebugString);
        }

        const archive = store.find(archiveName);

        await archive.read(true);
        await archive.saveIndexData();
    }
};


const terminal: TerminalInterface = new TerminalInterface();
terminal.executeScript(async (terminal, args) => {
    const options = IndexerOptions.create(args as any);
    const {
        debug
    } = options;

    let {
        version: gameVersion,
        archive,
        store: storePath
    } = options;

    const defaultStorePath = join('..', 'store');

    if(!storePath) {
        storePath = defaultStorePath;
    }

    /*while(!storePath) {
        const storePathInput = await terminal.question(`Store path (default ${defaultStorePath}):`, defaultStorePath);

        if(storePathInput) {
            storePath = storePathInput;

            if(!storePath || typeof storePath !== 'string' || !storePath.trim()) {
                logger.error(`Invalid store path supplied: ${storePathInput}`);
                storePath = '';
            }
        }
    }*/

    while(!gameVersion || gameVersion === -1) {
        const versionInput = await terminal.question(`Please supply the desired game version to index (default 435):`, '435');

        if(versionInput) {
            gameVersion = parseInt(versionInput, 10);

            if(isNaN(gameVersion)) {
                gameVersion = -1;
            }

            if(gameVersion < 400 || gameVersion > 459) {
                logger.error(`File store indexing currently only supports game versions 400-458.`);
                gameVersion = -1;
            }
        }
    }

    const logDir = join(storePath, 'logs');

    if(!existsSync(logDir)) {
        mkdirSync(logDir, { recursive: true });
    }

    setLoggerDest(join(logDir, `index-${gameVersion}.log`));

    const outputPath = join(storePath, 'output');
    const store = await Store.create(gameVersion, storePath, outputPath);

    while(!archive) {
        const archiveNameInput = await terminal.question(
            `Please supply the archive you wish to index (default 'main'):`, 'main')

        if(archiveNameInput) {
            archive = archiveNameInput.toLowerCase();

            if(!store.archiveConfig[archive]) {
                logger.error(`Archive ${archiveNameInput} was not found within the archive configuration file.`);
                archive = '';
            }
        }
    }

    terminal.close();

    await indexFiles(store, archive, args, debug);

    process.exit(0);
});
