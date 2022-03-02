import { join } from 'path';
import { existsSync, mkdirSync } from 'graceful-fs';
import { logger } from '@runejs/common';

import { Store, StoreType } from './fs';
import { ScriptExecutor, ArgumentOptions } from './scripts';


interface IndexerOptions {
    dir: string;
    type: StoreType;
    archive: string;
    build: number;
}


const indexerArgumentOptions: ArgumentOptions = {
    dir: {
        alias: 'd', type: 'string', default: './',
        description: `The store root directory. Defaults to the current location.`
    },
    type: {
        alias: 't', type: 'string', default: 'unpacked', choices: [ 'unpacked', 'packed' ],
        description: `The type of store to index, either 'unpacked' or 'packed'. Defaults to 'unpacked'.`
    },
    archive: {
        alias: 'a', type: 'string', default: 'main',
        description: `The archive to index. Defaults to 'main', which will index all store archives one by one. Specify an archive name to index a single archive.`
    },
    build: {
        alias: 'b', type: 'number', default: 435,
        description: `The game version that the store should belong to, also known as the game build number. Defaults to '435', a game build from late October, 2006.`
    }
};


async function indexFiles(store: Store, args: IndexerOptions): Promise<void> {
    const argDebugString = args ? Array.from(Object.entries(args))
        .map(([ key, val ]) => `${key} = ${val}`).join(', ') : '';

    const { archive: archiveName, type } = args;

    if(type === 'packed') {
        store.js5Load();
    } else {
        const outputDir = store.outputPath;
        if(!existsSync(outputDir)) {
            mkdirSync(outputDir, { recursive: true });
        }
    }

    if(archiveName === 'main') {
        logger.info(`Indexing ${type} store with arguments:`, argDebugString);

        if(type === 'unpacked') {
            await store.read();
        } else if(type === 'packed') {
            store.js5Decode(true);
        }

        store.js5Encode(true);
        store.compress(true);

        await store.saveIndexData(true, true, true);
    } else {
        logger.info(`Indexing ${type} archive ${archiveName} with arguments:`, argDebugString);

        const archive = store.find(archiveName);

        if(type === 'unpacked') {
            await archive.read(false);
        } else if(type === 'packed') {
            archive.js5Decode();
        }

        archive.js5Encode(true);
        archive.compress(true);

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

    const store = await Store.create(build, dir, {
        readFiles: false,
        compress: false
    });

    await indexFiles(store, args);

    logger.boom.flush();
    logger.boom.end();

    const end = Date.now();
    logger.info(`Indexing completed in ${(end - start) / 1000} seconds.`);

    process.exit(0);
});
