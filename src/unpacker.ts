import { join } from 'path';
import { existsSync, readdirSync, statSync, mkdirSync } from 'graceful-fs';
import { logger } from '@runejs/common';
import { Store } from './fs';
import { createObject, TerminalInterface, ArgumentMap } from './util';


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


const unpackFiles = async (store: Store, archiveName: string, args: ArgumentMap, debug: boolean): Promise<void> => {
    const argDebugString = args.size !== 0 ? Array.from(args.entries())
        .map(([ key, val ]) => `${ key } = ${ val }`).join(', ') : '';

    try {
        store.js5Load();

        if(archiveName === 'main') {
            logger.info(`Unpacking JS5 file store${ args.size !== 0 ? ` with arguments:` : `...` }`);
            if(args.size !== 0) {
                logger.info(argDebugString);
            }

            store.js5Decode();

            if(!debug) {
                await store.write();
            } else {
                logger.info(`Flat file store writing is disabled in debug mode.`, `Decoding completed.`);
            }
        } else {
            logger.info(`Unpacking JS5 archive ${ archiveName }${ args.size !== 0 ? ` with arguments:` : `...` }`);
            if(args.size !== 0) {
                logger.info(argDebugString);
            }

            const a = store.find(archiveName);

            if(!a) {
                throw new Error(`Archive ${ a } was not found.`);
            }

            a.js5Decode();

            if(!debug) {
                await a.write();
            } else {
                logger.info(`Archive writing is disabled in debug mode.`, `Decoding completed.`);
            }
        }
    } catch(error) {
        logger.error(error);
    }
};


const terminal: TerminalInterface = new TerminalInterface();
terminal.executeScript(async (terminal, args) => {
    const options = UnpackOptions.create(args as any);
    const {
        debug
    } = options;

    let {
        version: gameVersion,
        archive,
        store: storePath
    } = options;

    const defaultStorePath = './';

    if(!storePath) {
        storePath = defaultStorePath;
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

    logger.destination(join(logDir, `unpack_${ gameVersion }.log`));

    const store = await Store.create(gameVersion, storePath, {
        readFiles: false,
        compress: false
    });

    while(!archive) {
        const archiveNameInput = await terminal.question(
            `Please supply the archive you wish to unpack (default 'main'):`, 'main')

        if(archiveNameInput) {
            archive = archiveNameInput.toLowerCase();

            if(!store.archiveConfig[archive]) {
                logger.error(`Archive ${ archiveNameInput } was not found within the archive configuration file.`);
                archive = '';
            }
        }
    }

    terminal.close();

    const js5Dir = join(storePath, 'packed');

    if(!existsSync(js5Dir)) {
        mkdirSync(js5Dir, { recursive: true });
        logger.error(`JS5 file store not found at: ${ js5Dir }`);
        logger.error(`Please add the desired JS5 client file store to the ${ js5Dir } directory to unpack it.`);
    } else {
        const stats = statSync(js5Dir);
        if(!stats.isDirectory() || readdirSync(js5Dir).length === 0) {
            logger.error(`JS5 file store not found at: ${ js5Dir }`);
            logger.error(`Please add the desired JS5 client file store to the ${ js5Dir } directory to unpack it.`);
        } else {
            await unpackFiles(store, archive, args, debug);
        }
    }
});
