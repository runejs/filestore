import { ClientFileStore, extractIndexedFile, loadXteaRegionFiles } from './client-store';
import { FileStore } from './file-store';
import { decompressVersionedFile } from './compression';


const xteaRegions = async () => loadXteaRegionFiles('config/xteas');

(async () => {
    const clientFileStore = new ClientFileStore('./packed', {
        configDir: './config',
        xteas: await xteaRegions()
    });

    clientFileStore.getAllIndexes().forEach(index => index.generateArchive());

    /*const indexEntry = extractIndexedFile(2, 255, clientFileStore.channels);
    const decompressed = decompressVersionedFile(indexEntry.dataFile);

    console.log(`\n\nDecompressed Original:`);
    console.log(`LENGTH = ${decompressed.buffer.length}`);
    console.log(decompressed.buffer);*/


    const fileStore = new FileStore();

    const configArchive = await fileStore.loadStoreArchive(2, 'configs');

    // await configArchive.indexArchiveFiles();

    /*const packed = await configArchive.compress();

    console.log(`\n\nRe-Packed:`);
    console.log(`LENGTH = ${packed.length}`);
    console.log(packed);*/


    /*const testCacheFile = extractIndexedFile(10, 2, clientFileStore.channels).dataFile;

    console.log('\n\nCompressed Original');
    console.log(`LENGTH = ${testCacheFile.length}`);
    console.log(testCacheFile);

    const decompressedCacheFile = decompressVersionedFile(testCacheFile);

    console.log('\n\nDe-compressed Original');
    console.log(`LENGTH = ${decompressedCacheFile.buffer.length}`);
    console.log(decompressedCacheFile.buffer);



    const archivedFileGroup = await configArchive.getFile(10) as FileGroup;

    const repackedFile = await archivedFileGroup.compress();

    console.log('\n\nRe-compressed File');
    console.log(`LENGTH = ${repackedFile.length}`);
    console.log(repackedFile);

    const reunpackedrepackedFile = decompressVersionedFile(repackedFile);

    console.log('\n\nThe the fuck is this absolute monstrosity of a compression circle jerk');
    console.log(`LENGTH = ${reunpackedrepackedFile.buffer.length}`);
    console.log(reunpackedrepackedFile.buffer);*/
})();
