import { join } from 'path';
import { existsSync, readdirSync, statSync, mkdirSync } from 'graceful-fs';
import { logger } from '@runejs/common';

import { Store } from './fs';
import { ScriptExecutor, ArgumentOptions } from './scripts';


interface UnpackOptions {
    dir: string;
    debug: boolean;
    archive: string;
    build: number;
}


const unpackerArgumentOptions: ArgumentOptions = {
    dir: {
        alias: 'd', type: 'string', default: './',
        description: `The store root directory. Defaults to the current location.`
    },
    archive: {
        alias: 'a', type: 'string', default: 'main',
        description: `The archive to index. Defaults to 'main', which will unpack and index all store archives one by one. Specify an archive name to unpack a single archive.`
    },
    build: {
        alias: 'b', type: 'number', default: 435,
        description: `The game version that the store should belong to, also known as the game build number. Defaults to '435', a game build from late October, 2006.`
    },
    debug: {
        type: 'boolean', default: false,
        description: `Debug mode flag, when set to 'true' will not output any files to the disk. Defaults to 'false'.`
    }
};


async function unpackFiles(store: Store, args: UnpackOptions): Promise<void> {
    const argDebugString = args ? Array.from(Object.entries(args))
        .map(([ key, val ]) => `${key} = ${val}`).join(', ') : '';

    const { archive: archiveName, debug } = args;

    try {
        store.js5Load();

        if(archiveName === 'main') {
            logger.info(`Unpacking JS5 file store with arguments:`, argDebugString);

            store.js5Decode(true);

            store.js5Encode(true);
            store.compress(true);

            if(!debug) {
                store.write();
            } else {
                logger.info(`Flat file store writing is disabled in debug mode.`);
            }

            logger.info(`Decoding completed.`);

            await store.saveIndexData(true, true, true);
        } else {
            logger.info(`Unpacking JS5 archive with arguments:`, argDebugString);

            const a = store.find(archiveName);

            if(!a) {
                throw new Error(`Archive ${ a } was not found.`);
            }

            a.js5Decode(true);

            a.js5Encode(true);
            a.compress(true);

            if(!debug) {
                a.write();
            } else {
                logger.info(`Archive writing is disabled in debug mode.`);
            }

            logger.info(`Decoding completed.`);

            await a.saveIndexData(true, true);
        }
    } catch(error) {
        logger.error(error);
    }
}


new ScriptExecutor().executeScript<UnpackOptions>(unpackerArgumentOptions, async (terminal, args) => {
    const start = Date.now();
    logger.info(`Unpacking JS5 store...`);

    const { build, dir } = args;

    const logDir = join(dir, 'logs');

    if(!existsSync(logDir)) {
        mkdirSync(logDir, { recursive: true });
    }

    logger.destination(join(logDir, `unpack_${ build }.log`));

    const store = await Store.create(build, dir, {
        readFiles: false,
        compress: false
    });

    const js5Dir = join(dir, 'packed');

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
            await unpackFiles(store, args);
        }
    }

    logger.boom.flush();
    logger.boom.end();

    const end = Date.now();
    logger.info(`Unpacking completed in ${(end - start) / 1000} seconds.`);

    process.exit(0);
});
