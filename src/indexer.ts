import { join } from 'path';
import { existsSync, mkdirSync } from 'graceful-fs';
import { logger, setLoggerDest } from '@runejs/common';
import { Archive, Store, StoreType } from './fs';
import { createObject, TerminalInterface, ArgumentMap } from './util';


class IndexerOptions {

    public store: string = '';
    public type: StoreType = 'flat';
    public archive: string = '';
    public version: number = -1;

    public static create(options?: Partial<IndexerOptions>): IndexerOptions {
        return createObject<IndexerOptions>(IndexerOptions, options, true);
    }

}


const indexFiles = async (store: Store, archiveName: string, args: ArgumentMap, type: StoreType): Promise<void> => {
    const argDebugString = args.size !== 0 ? Array.from(args.entries())
        .map(([ key, val ]) => `${key} = ${val}`).join(', ') : '';

    if(type === 'js5') {
        store.js5Load();
    } else {
        const outputDir = store.outputPath;
        if(!existsSync(outputDir)) {
            mkdirSync(outputDir, { recursive: true });
        }
    }

    let archives: Archive[] = [];

    if(archiveName === 'main') {
        logger.info(`Indexing ${type} store${args.size !== 0 ? ` with arguments:` : `...`}`);
        if(args.size !== 0) {
            logger.info(argDebugString);
        }

        if(type === 'flat') {
            await store.read(true);
        } else if(type === 'js5') {
            store.js5Decode();
        }

        archives = Array.from(store.archives.values());
    } else {
        logger.info(`Indexing ${type} store archive ${archiveName}${args.size !== 0 ? ` with arguments:` : `...`}`);
        if(args.size !== 0) {
            logger.info(argDebugString);
        }

        const archive = store.find(archiveName);

        if(type === 'flat') {
            await archive.read(true);
        } else if(type === 'js5') {
            archive.js5Decode();
        }

        archives = [ archive ];
    }

    await store.saveIndexData();
    await archives.forEachAsync(async archive => await archive.saveIndexData());
};


const terminal: TerminalInterface = new TerminalInterface();
terminal.executeScript(async (terminal, args) => {
    const options = IndexerOptions.create(args as any);
    const {
        type
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

    while(!gameVersion || gameVersion === -1) {
        const versionInput = await terminal.question(`Please supply the desired game version to index (default 435):`, '435');

        if(versionInput) {
            gameVersion = parseInt(versionInput, 10);

            if(isNaN(gameVersion)) {
                gameVersion = -1;
            }
        }
    }

    if(type !== 'flat' && type !== 'js5') {
        throw new Error(`Invalid store type specified: ${type}. Please use 'flat' or 'js5' for store type.`);
    }

    const logDir = join(storePath, 'logs');

    if(!existsSync(logDir)) {
        mkdirSync(logDir, { recursive: true });
    }

    setLoggerDest(join(logDir, `index_${gameVersion}.log`));

    const store = await Store.create(gameVersion, storePath, {
        readFiles: false,
        compress: false
    });

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

    await indexFiles(store, archive, args, type);
});
