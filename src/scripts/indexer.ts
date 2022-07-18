import { join } from 'path';
import { existsSync, mkdirSync } from 'graceful-fs';
import { logger } from '@runejs/common';
import { ScriptExecutor, ArgumentOptions } from './script-executor';
import { JS5FileStore } from '../file-system/js5/js5-file-store';
import { JagStore } from '../file-system/jag/jag-store';
import { FileStoreBase } from '../file-system/file-store-base';
import { Archive } from '../file-system/js5/archive';


interface IndexerOptions {
    dir: string;
    format: 'flat' | 'js5' | 'jag';
    archive: string;
    build: string;
}


const indexerArgumentOptions: ArgumentOptions = {
    dir: {
        alias: 'd', type: 'string', default: './',
        description: `The store root directory. Defaults to the current location.`
    },
    format: {
        alias: 'f',
        type: 'string',
        default: 'unpacked',
        choices: [ 'unpacked', 'packed', 'flat', 'js5' ],
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


const indexJS5Store = async (store: JS5FileStore) => {
    logger.info(`Unpacking archives from JS5 store...`);

    for (const [ , archive ] of store.archives) {
        store.js5.unpack(archive);
    }

    logger.info(`Decoding JS5 archives...`);

    for (const [ , archive ] of store.archives) {
        await store.js5.decodeArchive(archive);
    }

    logger.info(`Saving archive indexes...`);

    for (const [ , archive ] of store.archives) {
        await archive.saveIndex();
    }

    logger.info(`Unpacking groups from JS5 store...`);

    for (const [ , archive ] of store.archives) {
        for (const [ , group ] of archive.groups) {
            store.js5.unpack(group);
        }

        logger.info(`Finished unpacking archive ${ archive.index.name } groups.`);
    }

    logger.info(`Decoding JS5 groups...`);

    for (const [ , archive ] of store.archives) {
        for (const [ , group ] of archive.groups) {
            await store.js5.decodeGroup(group);
        }

        logger.info(`Finished decoding archive ${ archive.index.name } groups.`);
    }

    logger.info(`Saving group indexes...`);

    for (const [ , archive ] of store.archives) {
        await archive.upsertGroupIndexes();
    }

    logger.info(`Saving flat file indexes...`);

    for (const [ , archive ] of store.archives) {
        for (const [ , group ] of archive.groups) {
            await group.upsertFileIndexes();
        }
    }
};


const indexJS5Archive = async (store: JS5FileStore, archiveName: string) => {
    const archive = store.findArchive(archiveName);

    if (!archive) {
        logger.error(`Archive ${ archiveName } was not found.`);
        return;
    }

    logger.info(`Unpacking archive ${ archiveName } from JS5 store...`);

    store.js5.unpack(archive);

    logger.info(`Decoding archive ${ archiveName }...`);

    await store.js5.decodeArchive(archive);

    logger.info(`Saving archive ${ archiveName } index...`);

    await archive.saveIndex();

    logger.info(`Unpacking groups from archive ${ archiveName }...`);

    for (const [ , group ] of archive.groups) {
        store.js5.unpack(group);
    }

    logger.info(`Decoding archive ${ archiveName } groups...`);

    for (const [ , group ] of archive.groups) {
        await store.js5.decodeGroup(group);
    }

    logger.info(`Saving group indexes...`);

    await archive.upsertGroupIndexes();

    logger.info(`Saving flat file indexes...`);

    for (const [ , group ] of archive.groups) {
        await group.upsertFileIndexes();
    }
};


const indexJagStore = async (store: JagStore) => {
    // @todo 18/07/22 - Kiko
};


const indexJagArchive = async (store: JagStore, archiveName: string) => {
    // @todo 18/07/22 - Kiko
};


const indexerScript = async (
    terminal,
    { build, dir, format, archive: archiveName }
) => {
    const start = Date.now();
    const logDir = join(dir, 'logs');
    const numericBuildNumber: boolean = /^\d+$/.test(build);
    
    if (!existsSync(logDir)) {
        mkdirSync(logDir, { recursive: true });
    }

    logger.destination(join(logDir, `index-${ format }-${ build }.log`));

    logger.info(`Indexing ${ format } file store...`);

    if (format === 'js5') {
        const store = new JS5FileStore(numericBuildNumber ? Number(build) : build, dir);
        await store.load();
        store.js5.loadJS5Files();

        if (archiveName === 'main') {
            await indexJS5Store(store);
        } else {
            await indexJS5Archive(store, archiveName);
        }
    } else if (format === 'jag') {
        const store = new JagStore(numericBuildNumber ? Number(build) : build, dir);
        await store.load();
        store.jag.loadJagFiles();

        // @todo 18/07/22 - Kiko
    } else if (format === 'flat') {
        // @todo 18/07/22 - Kiko
    }

    logger.info(`Indexing completed in ${ (Date.now() - start) / 1000 } seconds.`);
    logger.boom.flushSync();
    logger.boom.end();
};


new ScriptExecutor().executeScript<IndexerOptions>(indexerArgumentOptions, indexerScript);
