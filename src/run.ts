import { ClientFileStore, loadXteaRegionFiles } from './client-store';
import { FileStore } from './file-store/file-store';
import { logger } from '@runejs/core';


const xteaRegions = async () => loadXteaRegionFiles('config/xteas');

(async () => {
    const clientFileStore = new ClientFileStore('./packed', {
        configDir: './config',
        xteas: await xteaRegions()
    });

    const testRegion = clientFileStore.regionStore.getRegion(27, 80);
    logger.info(testRegion);



    // clientFileStore.getAllIndexes().forEach(index => index.generateIndexedArchive());

    // const fileStore = new FileStore();
    // fileStore.loadStoreArchive(6, 'music');
})();


