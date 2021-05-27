import { ClientFileStore, compressBzip, decompressBzip, loadXteaRegionFiles } from './client-store';
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

    console.log(testRegionFile.content.buffer);

    console.log(String.fromCharCode(testRegionFile.content[0]));
    console.log(String.fromCharCode(testRegionFile.content[1]));
    console.log(String.fromCharCode(testRegionFile.content[2]));
    console.log(String.fromCharCode(testRegionFile.content[3]));

    testRegionFile.decompress();

    const reCompressedFile = compressBzip(testRegionFile.content);

    const reDecompressedFile = decompressBzip(reCompressedFile);

    console.log(reDecompressedFile.buffer);

    console.log(String.fromCharCode(reDecompressedFile[0]));
    console.log(String.fromCharCode(reDecompressedFile[1]));
    console.log(String.fromCharCode(reDecompressedFile[2]));
    console.log(String.fromCharCode(reDecompressedFile[3]));



    // clientFileStore.getAllIndexes().forEach(index => index.generateIndexedArchive());

    // const fileStore = new FileStore();
    // fileStore.loadStoreArchive(6, 'music');
})();


