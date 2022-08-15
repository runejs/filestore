import { logger } from '@runejs/common';
import { indexes, JagArchive, JagFileStore } from '../file-system/jag';
import { JagInterfaceArchive } from '../file-system/jag/content/archives/interfaces/jag-interface-archive';


const dev = async () => {
    const start = Date.now();

    const store = new JagFileStore(317);

    logger.info(`Loading JAG store for build ${store.gameBuild}...`);

    await store.load();

    logger.info(`Loading index entities...`);

    const indexNames = Object.keys(indexes);
    for (const indexName of indexNames) {
        store.createIndex(indexes[indexName]);
    }

    await store.loadIndexEntities();

    logger.info(`Loading index file entities...`);

    for (const [ , indexFile ] of store.indexes) {
        await indexFile.loadFileIndexes();
    }

    logger.info(`Loading archive file entities...`);

    const archiveIndex = store.getIndex('archives');

    for (const [ , file ] of archiveIndex.files) {
        const archive = file as JagArchive;
        await archive.loadFileIndexes();
    }

    logger.info(`Decoding game interfaces...`);

    const interfaceArchive = new JagInterfaceArchive(store);

    interfaceArchive.decodeAll();

    logger.info(`${interfaceArchive.interfaces.size} interfaces decoded. Saving interface entities...`);

    await interfaceArchive.saveAll();

    const end = Date.now();
    logger.info(`Operations completed in ${(end - start) / 1000} seconds.`);
};

dev().catch(console.error);
