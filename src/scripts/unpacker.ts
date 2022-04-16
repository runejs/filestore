import { join } from 'path';
import { existsSync, readdirSync, statSync, mkdirSync } from 'graceful-fs';
import { logger, prettyPrintTarget, fileTarget } from '@runejs/common';

import { Store } from '../index';


logger.setTargets([
    prettyPrintTarget(), 
    fileTarget(join('.', 'logs', `unpacker.log`))
]);


export interface UnpackOptions {
    dir: string;
    debug: boolean;
    archive: string;
    build: string;
}


export async function unpackFiles(args: UnpackOptions): Promise<void> {
    const start = Date.now();
    
    const argDebugString = args ? Array.from(Object.entries(args))
        .map(([ key, val ]) => `${key} = ${val}`).join(', ') : '';

    logger.info(`Unpacking JS5 store with arguments:`, argDebugString);

    const { build, dir } = args;

    const store = await Store.create(build, dir);

    const js5Dir = join(dir, 'packed');

    if (!existsSync(js5Dir)) {
        mkdirSync(js5Dir, { recursive: true });
        logger.error(`JS5 file store not found at: ${ js5Dir }`);
        logger.error(`Please add the desired JS5 client file store to the ${ js5Dir } directory to unpack it.`);
    } else {
        const stats = statSync(js5Dir);
        if (!stats.isDirectory() || readdirSync(js5Dir).length === 0) {
            logger.error(`JS5 file store not found at: ${ js5Dir }`);
            logger.error(`Please add the desired JS5 client file store to the ${ js5Dir } directory to unpack it.`);
        } else {
            const { archive: archiveName, debug } = args;

            store.loadPackedStore();

            if (archiveName === 'main') {
                store.decode(true);

                store.encode(true);
                store.compress(true);

                if (!debug) {
                    store.write();
                } else {
                    logger.info(`Flat file store writing is disabled in debug mode.`);
                }

                logger.info(`Decoding completed.`);

                await store.saveIndexData(true, true, true);
            } else {
                const a = store.find(archiveName);

                if (!a) {
                    throw new Error(`Archive ${ a } was not found.`);
                }

                a.decode(true);

                a.encode(true);
                a.compress(true);

                if (!debug) {
                    a.write();
                } else {
                    logger.info(`Archive writing is disabled in debug mode.`);
                }

                logger.info(`Decoding completed.`);

                await a.saveIndexData(true, true);
            }
        }
    }

    const end = Date.now();
    logger.info(`Unpacking completed in ${(end - start) / 1000} seconds.`);

    process.exit(0);
}
