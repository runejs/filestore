import { ClientFileStore, compressBzip, loadXteaRegionFiles } from './client-store';
import { FileStore } from './file-store/file-store';
import { logger } from '@runejs/core';


const xteaRegions = async () => loadXteaRegionFiles('config/xteas');

(async () => {
    const clientFileStore = new ClientFileStore('./packed', {
        configDir: './config',
        xteas: await xteaRegions()
    });

    const testRegion = clientFileStore.regionStore.getRegion(27, 80);

    const testRegionFile = clientFileStore.getIndex('regions').getFile(testRegion.mapFile.fileId);
    testRegionFile.decompress();


    const reCompressedFile = compressBzip(testRegionFile.content);

    console.log(reCompressedFile);

    console.log(String.fromCharCode(reCompressedFile[0]));
    console.log(String.fromCharCode(reCompressedFile[1]));
    console.log(String.fromCharCode(reCompressedFile[2]));
    console.log(String.fromCharCode(reCompressedFile[3]));



    // clientFileStore.getAllIndexes().forEach(index => index.generateIndexedArchive());

    // const fileStore = new FileStore();
    // fileStore.loadStoreArchive(6, 'music');
})();


