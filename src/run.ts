import { ClientFileStore, extractIndexedFile, loadXteaRegionFiles } from './client-store';
import { FileStore } from './file-store/file-store';
import { FileGroup } from './file-store/archive/file-group';
import { decompressFile } from './compression';


const xteaRegions = async () => loadXteaRegionFiles('config/xteas');

(async () => {
    const clientFileStore = new ClientFileStore('./packed', {
        configDir: './config',
        xteas: await xteaRegions()
    });

    const testCacheFile = extractIndexedFile(10, 2, clientFileStore.channels).dataFile;

    console.log('\n\nCompressed Original');
    console.log(`LENGTH = ${testCacheFile.length}`);
    console.log(testCacheFile);

    const decompressedCacheFile = decompressFile(testCacheFile);

    console.log('\n\nDe-compressed Original');
    console.log(`LENGTH = ${decompressedCacheFile.buffer.length}`);
    console.log(decompressedCacheFile.buffer);

    const fileStore = new FileStore();

    const configArchive = await fileStore.loadStoreArchive(2, 'configs');

    const archivedFileGroup = await configArchive.getFile(10) as FileGroup;

    const repackedFile = await archivedFileGroup.compress();

    console.log('\n\nRe-compressed File');
    console.log(`LENGTH = ${repackedFile.length}`);
    console.log(repackedFile);

    const reunpackedrepackedFile = decompressFile(repackedFile);

    console.log('\n\nThe the fuck is this absolute monstrosity of a compression circle jerk');
    console.log(`LENGTH = ${reunpackedrepackedFile.buffer.length}`);
    console.log(reunpackedrepackedFile.buffer);
})();
