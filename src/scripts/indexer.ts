import { logger } from '@runejs/common';
import { ScriptExecutor, ArgumentOptions } from './script-executor';
import { Js5FileStore } from '../file-system/js5';
import { archives, caches, JagArchive, JagFileStore } from '../file-system/jag';
import {
    getOpenRS2CacheFilesByBuild,
} from '../openrs2';
import { PackedCacheFile, getPackedCacheFormat } from '../file-system/packed';
import {
    JagInterfaceArchive
} from '../file-system/jag/content/archives/interfaces/jag-interface-archive';


interface IndexerOptions {
    dir: string;
    format: 'flat' | 'packed';
    archive: string;
    build: string;
}


const indexerArgumentOptions: ArgumentOptions = {
    archive: {
        alias: 'a',
        type: 'string',
        default: 'main',
        description: `The archive to index. Defaults to 'main', which will index all store archives one by one. Specify an archive name to index a single archive.`
    },
    build: {
        alias: 'b',
        type: 'string',
        default: '435',
        description: `The game build (revision) that the store should belong to, also known as the game build number. Defaults to '435', a game build from late October, 2006.`
    },
    dir: {
        alias: 'd',
        type: 'string',
        default: './',
        description: `The store root directory. Defaults to the current location.`
    },
    format: {
        alias: 'f',
        type: 'string',
        default: 'packed',
        choices: [ 'packed', 'flat' ],
        description: `The format of the store to index, either 'packed' (JAG or JS5 format) or 'flat' (flat files). Defaults to 'packed'.`
    },
    source: {
        alias: 's',
        type: 'string',
        default: 'openrs2',
        choices: [ 'openrs2', 'local' ],
        description: `The store source location - either 'openrs2' to pull cache and xtea files from OpenRS2.org or 'local' for caches and xtea files stored locally.`
    },
};


const indexJS5Store = async (store: Js5FileStore) => {
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

    logger.info(`Saving archive data...`);

    for (const [ , archive ] of store.archives) {
        await archive.saveUncompressedData();
        await archive.saveCompressedData();
    }

    logger.info(`Saving group data...`);

    for (const [ , archive ] of store.archives) {
        await archive.upsertGroupData();
    }

    logger.info(`Saving flat file data...`);

    for (const [ , archive ] of store.archives) {
        for (const [ , group ] of archive.groups) {
            await group.upsertFileData();
        }
    }
};


const indexJS5Archive = async (store: Js5FileStore, archiveName: string) => {
    const archive = await store.getArchive(archiveName);

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

    logger.info(`Saving archive ${ archiveName } data...`);

    await archive.saveUncompressedData();
    await archive.saveCompressedData();

    logger.info(`Saving group data...`);

    await archive.upsertGroupData();

    logger.info(`Saving flat file data...`);

    for (const [ , group ] of archive.groups) {
        await group.upsertFileData();
    }
};


const indexJagStore = async (store: JagFileStore) => {
    logger.info(`Decoding JAG store indexes...`);

    const indexNames = Object.keys(caches);
    for (const indexName of indexNames) {
        store.jag.decodeCache(indexName);
    }

    logger.info(`Saving JAG caches...`);

    for (const [ , cache ] of store.caches) {
        await cache.saveIndex();
    }

    for (const [, cache ] of store.caches) {
        logger.info(`Unpacking JAG files for index ${cache.index.name}...`);

        for (const [ , file ] of cache.files) {
            store.jag.unpack(file);
        }
    }

    logger.info(`Decoding JAG archives...`);

    const archiveIndex = store.getCache(caches.archives);

    for (const [ , archive ] of archiveIndex.files) {
        if (archive instanceof JagArchive) {
            logger.info(`Decoding archive ${archive.index.name}...`);
            store.jag.decodeArchive(archive);
        }
    }

    logger.info(`Saving JAG file indexes...`);

    for (const [, index ] of store.caches) {
        await index.upsertFileIndexes();
    }

    logger.info(`Saving JAG archive file indexes...`);

    for (const [ , archive ] of archiveIndex.files) {
        if (archive instanceof JagArchive) {
            await archive.upsertFileIndexes();
        }
    }

    logger.info(`Saving JAG cache data...`);

    for (const [ , cache ] of store.caches) {
        await cache.saveCompressedData();
        await cache.saveUncompressedData();
    }

    logger.info(`Saving JAG cache file data...`);

    for (const [ , cache ] of store.caches) {
        await cache.upsertFileData();
    }

    logger.info(`Saving JAG archive file data...`);

    for (const [ , archive ] of archiveIndex.files) {
        if (archive instanceof JagArchive) {
            await archive.upsertFileData();
        }
    }

    const saveInterfaces = async (store: JagFileStore) => {
        logger.info(`Decoding game interfaces...`);

        const interfaceArchive = new JagInterfaceArchive(store);

        await interfaceArchive.decodeAll();

        logger.info(`${interfaceArchive.interfaces.size} interfaces decoded. Saving interface entities...`);

        await interfaceArchive.saveAll();
    };

    await saveInterfaces(store);
};


const indexJagArchive = async (store: JagFileStore, archiveName: string) => {
    // @todo 18/07/22 - Kiko
};


const indexerScript = async (
    { build, dir, format, archive: archiveName, source }
) => {
    const start = Date.now();
    const numericBuildNumber: number = /^\d+$/.test(build) ? parseInt(build, 10) : -1;
    let cacheFiles: PackedCacheFile[] | 'local' = 'local';

    if (source === 'openrs2') {
        if (numericBuildNumber) {
            const openRS2CacheFiles = await getOpenRS2CacheFilesByBuild(numericBuildNumber);
            if (!openRS2CacheFiles?.length) {
                return;
            }

            cacheFiles = openRS2CacheFiles;
        } else {
            logger.error(`A numeric build number must be used in order to pull cache information from OpenRS2.org.`);
            return;
        }
    }

    const storeType = cacheFiles !== 'local' ? getPackedCacheFormat(cacheFiles) : 'flat';

    logger.info(`Indexing ${ storeType === 'flat' ? storeType : storeType.toUpperCase() } file store...`);

    if (storeType === 'js5') {
        const store = new Js5FileStore(numericBuildNumber !== -1 ? numericBuildNumber : build, dir);
        await store.load();

        if (cacheFiles === 'local') {
            store.js5.readLocalCacheFiles();
        } else {
            store.js5.readOpenRS2CacheFiles(cacheFiles);
        }

        if (archiveName === 'main') {
            await indexJS5Store(store);
        } else {
            await indexJS5Archive(store, archiveName);
        }

        await store.closeDatabase();
    } else if (storeType === 'jag') {
        const store = new JagFileStore(numericBuildNumber !== -1 ? numericBuildNumber : build, dir);
        await store.load();

        if (cacheFiles === 'local') {
            store.jag.readLocalPackedCacheFiles();
        } else {
            store.jag.readOpenRS2PackedCacheFiles(cacheFiles);
        }

        if (archiveName === 'main') {
            await indexJagStore(store);
        } else {
            await indexJagArchive(store, archiveName);
        }

        await store.closeDatabase();
    } else if (format === 'flat') {
        // @todo 18/07/22 - Kiko
    }

    logger.info(`Indexing completed in ${ (Date.now() - start) / 1000 } seconds.`);
};


new ScriptExecutor().executeScript<IndexerOptions>(indexerArgumentOptions, indexerScript);
