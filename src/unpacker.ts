import { join } from 'path';
import { existsSync, readdirSync, statSync, mkdirSync } from 'graceful-fs';
import { logger, setLoggerDest } from '@runejs/common';
import { Store } from './fs';
import { run, createObject, TerminalInterface, ArgumentMap } from './util';


class UnpackOptions {

    public store: string = '';
    public skipXtea: boolean = false;
    public matchMapFiles: boolean = false;
    public debug: boolean = false;
    public archive: string = '';
    public version: number = -1;

    public static create(options?: Partial<UnpackOptions>): UnpackOptions {
        return createObject<UnpackOptions>(UnpackOptions, options, true);
    }

}


const unpackFiles = (store: Store, archiveName: string, args: ArgumentMap, debug: boolean): void => {
    const argDebugString = args.size !== 0 ? Array.from(args.entries())
        .map(([ key, val ]) => `${key} = ${val}`).join(', ') : '';

    try {
        store.js5Load();

        if (archiveName === 'main') {
            logger.info(`Unpacking JS5 file store${ args.size !== 0 ? ` with arguments:` : `...` }`);
            if (args.size !== 0) {
                logger.info(argDebugString);
            }

            store.js5Decode();

            if (!debug) {
                store.write();
            } else {
                logger.info(`Flat file store writing is disabled in debug mode.`, `Decoding completed.`);
            }
        } else {
            logger.info(`Unpacking JS5 archive ${ archiveName }${ args.size !== 0 ? ` with arguments:` : `...` }`);
            if (args.size !== 0) {
                logger.info(argDebugString);
            }

            const a = store.find(archiveName);

            if (!a) {
                throw new Error(`Archive ${ a } was not found.`);
            }

            a.js5Decode();

            if (!debug) {
                a.write();
            } else {
                logger.info(`Archive writing is disabled in debug mode.`, `Decoding completed.`);
            }
        }
    } catch (error) {
        logger.error(error);
    }
};


run(async args => {
    const options = UnpackOptions.create(args as any);
    const {
        debug
    } = options;

    let {
        version: gameVersion,
        archive,
        store: storePath
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
        const versionInput = await terminal.question(`Please supply the desired game version to unpack (default 435):`, '435');

        if(versionInput) {
            gameVersion = parseInt(versionInput, 10);

            if(isNaN(gameVersion)) {
                gameVersion = -1;
            }

            if(gameVersion < 400 || gameVersion > 459) {
                logger.error(`File store unpacking currently only supports game versions 400-458.`);
                gameVersion = -1;
            }
        }
    }

    const logDir = join(storePath, 'logs');

    if(!existsSync(logDir)) {
        mkdirSync(logDir, { recursive: true });
    }

    setLoggerDest(join(logDir, `unpack-${gameVersion}.log`));

    const outputPath = join(storePath, 'output');
    const store = new Store(gameVersion, storePath, outputPath);

    while(!archive) {
        const archiveNameInput = await terminal.question(
            `Please supply the archive you wish to unpack (default 'main'):`, 'main')

        if(archiveNameInput) {
            archive = archiveNameInput.toLowerCase();

            if(!store.archiveConfig[archive]) {
                logger.error(`Archive ${archiveNameInput} was not found within the archive configuration file.`);
                archive = '';
            }
        }
    }

    terminal.close();

    const js5Dir = join(storePath, 'js5');

    if(!existsSync(js5Dir)) {
        mkdirSync(js5Dir,{ recursive: true });
        logger.error(`JS5 file store not found at: ${js5Dir}`);
        logger.error(`Please add the desired JS5 client file store to the ${js5Dir} directory to unpack it.`);
    } else {
        const stats = statSync(js5Dir);
        if(!stats.isDirectory() || readdirSync(js5Dir).length === 0) {
            logger.error(`JS5 file store not found at: ${js5Dir}`);
            logger.error(`Please add the desired JS5 client file store to the ${js5Dir} directory to unpack it.`);
        } else {
            unpackFiles(store, archive, args, debug);
        }
    }

    process.exit(0);
});
