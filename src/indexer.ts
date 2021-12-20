import { join } from 'path';
import { existsSync, mkdirSync } from 'graceful-fs';
import { logger, setLoggerDest } from '@runejs/common';
import { Store } from './fs';
import { run, createObject, TerminalInterface, ArgumentMap } from './util';


class IndexerOptions {

    public store: string = '';
    public debug: boolean = false;
    public compress: boolean = null;
    public archive: string = '';
    public version: number = -1;

    public static create(options?: Partial<IndexerOptions>): IndexerOptions {
        return createObject<IndexerOptions>(IndexerOptions, options, true);
    }

}


const indexFiles = (store: Store, archiveName: string, compress: boolean, args: ArgumentMap, debug: boolean): void => {
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

        store.read(compress);
        Array.from(store.archives.values()).forEach(archive => archive.writeIndexFile());
    } else {
        logger.info(`Indexing flat file store archive ${archiveName}${args.size !== 0 ? ` with arguments:` : `...`}`);
        if(args.size !== 0) {
            logger.info(argDebugString);
        }

        store.load();

        const archive = store.find(archiveName);

        archive.read(compress);
        archive.writeIndexFile();
    }
};


run(async args => {
    const options = IndexerOptions.create(args as any);
    const {
        debug
    } = options;

    let {
        version: gameVersion,
        archive,
        store: storePath,
        compress
    } = options;

    const terminal: TerminalInterface = new TerminalInterface();
    const defaultStorePath = join('..', 'store');

    while(!storePath) {
        const storePathInput = await terminal.question(`Store path (default ${defaultStorePath}):`, defaultStorePath);

        if(storePathInput) {
            storePath = storePathInput;

            if(!storePath || typeof storePath !== 'string' || !storePath.trim()) {
                logger.error(`Invalid store path supplied: ${storePathInput}`);
                storePath = '';
            }
        }
    }

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
    const store = new Store(gameVersion, storePath, outputPath);

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


    while(compress === null) {
        let compressInput = await terminal.question(
            `Compress files for indexing? (default 'false'):`, 'false')

        if(compressInput) {
            compressInput = compressInput.toLowerCase();

            if(compressInput === 'true') {
                compress = true;
            } else if(compressInput === 'false') {
                compress = false;
            } else {
                logger.error(`Compression response invalid, defaulting to 'false'.`);
                compress = false;
            }
        }
    }

    terminal.close();

    indexFiles(store, archive, compress, args, debug);
});
