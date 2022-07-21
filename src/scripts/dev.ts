import { JS5FileStore } from '../file-system/js5/js5-file-store';
import { logger } from '@runejs/common';


const dev = async () => {
    const start = Date.now();
    const fileStore = new JS5FileStore(435);
    await fileStore.load();
    fileStore.js5.readLocalCacheFiles();

    logger.info(`Unpacking archives from JS5 store...`);

    for (const [ , archive ] of fileStore.archives) {
        fileStore.js5.unpack(archive);
    }

    logger.info(`Decoding JS5 archives...`);

    for (const [ , archive ] of fileStore.archives) {
        await fileStore.js5.decodeArchive(archive);
    }

    logger.info(`Saving archive indexes...`);

    for (const [ , archive ] of fileStore.archives) {
        await archive.saveIndex();
    }

    logger.info(`Unpacking groups from JS5 store...`);

    for (const [ , archive ] of fileStore.archives) {
        for (const [ , group ] of archive.groups) {
            fileStore.js5.unpack(group);
        }

        logger.info(`Finished unpacking archive ${archive.index.name} groups.`);
    }

    logger.info(`Decoding JS5 groups...`);

    for (const [ , archive ] of fileStore.archives) {
        for (const [ , group ] of archive.groups) {
            await fileStore.js5.decodeGroup(group);
        }

        logger.info(`Finished decoding archive ${archive.index.name} groups.`);
    }

    logger.info(`Saving group indexes...`);

    for (const [ , archive ] of fileStore.archives) {
        await archive.upsertGroupIndexes();
    }

    logger.info(`Saving flat file indexes...`);

    for (const [ , archive ] of fileStore.archives) {
        for (const [ , group ] of archive.groups) {
            await group.upsertFileIndexes();
        }
    }

    const end = Date.now();
    logger.info(`Operations completed in ${(end - start) / 1000} seconds.`);
};

dev().catch(console.error);
