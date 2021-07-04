import { FileStore } from './file-store';
import { logger } from '@runejs/core';


(async () => {
    // const xteaRegions = async () => loadXteaRegionFiles('config/xteas');

    /*const clientFileStore = new ClientFileStore('./packed', {
        configDir: './config',
        xteas: await xteaRegions()
    });*/

    // Decode a packed client cache with this line vvv
    // clientFileStore.getAllIndexes().forEach(index => index.generateArchive(true));

    // Decode a single packed client cache archive with this line vvv
    // await clientFileStore.getIndex(0).generateArchive();



    const fileStore = new FileStore();

    await fileStore.loadStoreArchives();

    const start = Date.now();

    /*for(let i = 0; i < fileStore.indexedArchives.size; i++) {
        logger.info(`Indexing archive ${i}...`);
        await fileStore.indexedArchives.get(i).indexArchiveFiles();
    }*/

    // await fileStore.generateCrcTable();

    await fileStore.indexedArchives.get(8).unpack();

    const end = Date.now();
    const duration = end - start;

    logger.info(`Operations completed in ${duration / 1000} seconds.`);
})();
