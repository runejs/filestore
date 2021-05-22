import { ClientFileStore, loadXteaRegionFiles } from './client-store';
import { FileStore } from './file-store/file-store';


const xteaRegions = async () => loadXteaRegionFiles('config/xteas');

(async () => {
    const clientFileStore = new ClientFileStore('./packed', {
        configDir: './config',
        xteas: await xteaRegions()
    });



    // clientFileStore.getAllIndexes().forEach(index => index.generateIndexedArchive());

    // const fileStore = new FileStore();
    // fileStore.loadStoreArchive(6, 'music');
})();


