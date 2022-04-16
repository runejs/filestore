import { join } from 'path';
import { existsSync, mkdirSync } from 'graceful-fs';
import { fileTarget, logger, prettyPrintTarget } from '@runejs/common';

import { Store, StoreFormat } from '../index';


logger.setTargets([
    prettyPrintTarget(), 
    fileTarget(join('.', 'logs', `indexer.log`))
]);


export interface IndexerOptions {
    dir: string;
    format: StoreFormat | 'flat' | 'js5';
    archive: string;
    build: string;
}


export async function indexFiles(args: IndexerOptions): Promise<void> {
    const start = Date.now();

    const argDebugString = args ? Array.from(Object.entries(args))
        .map(([ key, val ]) => `${key} = ${val}`).join(', ') : '';

    const { build, dir } = args;
    let format = args.format;

    if (format === 'js5') {
        format = 'packed';
    } else if (format === 'flat') {
        format = 'unpacked';
    }

    logger.info(`Indexing ${format} store with arguments:`, argDebugString);

    const store = await Store.create(build, dir);

    const { archive: archiveName } = args;

    if (format === 'packed') {
        store.loadPackedStore();
    } else {
        const outputDir = store.outputPath;
        if (!existsSync(outputDir)) {
            mkdirSync(outputDir, { recursive: true });
        }
    }

    if (archiveName === 'main') {
        if (format === 'unpacked') {
            await store.read();
        } else if (format === 'packed') {
            store.decode(true);
        }

        store.encode(true);
        store.compress(true);

        await store.saveIndexData(true, true, true);
    } else {
        const archive = store.find(archiveName);

        if (format === 'unpacked') {
            await archive.read(false);
        } else if (format === 'packed') {
            archive.decode();
        }

        archive.encode(true);
        archive.compress(true);

        await store.saveIndexData(false, false, false);
        await archive.saveIndexData(true, true);
    }

    const end = Date.now();
    logger.info(`Indexing completed in ${(end - start) / 1000} seconds.`);

    process.exit(0);
}
