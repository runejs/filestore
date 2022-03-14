import { join } from 'path';
import { existsSync, mkdirSync } from 'graceful-fs';
import { logger } from '@runejs/common';

import { Store, StoreFormat } from '../index';
import { ScriptExecutor, ArgumentOptions } from './index';


interface IndexerOptions {
    dir: string;
    format: StoreFormat | 'flat' | 'js5';
    archive: string;
    build: string;
}


const indexerArgumentOptions: ArgumentOptions = {
    dir: {
        alias: 'd', type: 'string', default: './',
        description: `The store root directory. Defaults to the current location.`
    },
    format: {
        alias: 'f', type: 'string', default: 'unpacked', choices: [ 'unpacked', 'packed', 'flat', 'js5' ],
        description: `The format of the store to index, either 'unpacked' (flat files) or 'packed' (JS5 format). Defaults to 'unpacked'.`
    },
    archive: {
        alias: 'a', type: 'string', default: 'main',
        description: `The archive to index. Defaults to 'main', which will index all store archives one by one. Specify an archive name to index a single archive.`
    },
    build: {
        alias: 'b', type: 'string', default: '435',
        description: `The game build (revision) that the store should belong to, also known as the game build number. Defaults to '435', a game build from late October, 2006.`
    }
};


async function indexFiles(store: Store, args: IndexerOptions): Promise<void> {
    const argDebugString = args ? Array.from(Object.entries(args))
        .map(([ key, val ]) => `${key} = ${val}`).join(', ') : '';

    const { archive: archiveName } = args;

    let format = args.format;
    if(format === 'js5') {
        format = 'packed';
    } else if(format === 'flat') {
        format = 'unpacked';
    }

    if(format === 'packed') {
        store.loadPackedStore();
    } else {
        const outputDir = store.outputPath;
        if(!existsSync(outputDir)) {
            mkdirSync(outputDir, { recursive: true });
        }
    }

    if(archiveName === 'main') {
        logger.info(`Indexing ${format} store with arguments:`, argDebugString);

        if(format === 'unpacked') {
            await store.read();
        } else if(format === 'packed') {
            store.decode(true);
        }

        store.encode(true);
        store.compress(true);

        await store.saveIndexData(true, true, true);
    } else {
        logger.info(`Indexing ${format} archive ${archiveName} with arguments:`, argDebugString);

        const archive = store.find(archiveName);

        if(format === 'unpacked') {
            await archive.read(false);
        } else if(format === 'packed') {
            archive.decode();
        }

        archive.encode(true);
        archive.compress(true);

        await store.saveIndexData(false, false, false);
        await archive.saveIndexData(true, true);
    }
}


new ScriptExecutor().executeScript<IndexerOptions>(indexerArgumentOptions, async (terminal, args) => {
    const start = Date.now();
    logger.info(`Indexing store...`);

    const { build, dir } = args;

    const logDir = join(dir, 'logs');

    if(!existsSync(logDir)) {
        mkdirSync(logDir, { recursive: true });
    }

    logger.destination(join(logDir, `index_${build}.log`));

    const store = await Store.create(build, dir);

    await indexFiles(store, args);

    logger.boom.flushSync();
    logger.boom.end();

    const end = Date.now();
    logger.info(`Indexing completed in ${(end - start) / 1000} seconds.`);

    process.exit(0);
});
