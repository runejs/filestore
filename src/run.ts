import { ClientFileStore, loadXteaRegionFiles } from './client-store';
import { FileStore } from './file-store/file-store';
import { FileGroup } from './file-store/archive/file-group';


const xteaRegions = async () => loadXteaRegionFiles('config/xteas');

(async () => {
    const clientFileStore = new ClientFileStore('./packed', {
        configDir: './config',
        xteas: await xteaRegions()
    });

    const testCacheFile = clientFileStore.getIndex('configs').getArchive(10);

    console.log(testCacheFile.content.buffer);

    const fileStore = new FileStore();

    const configArchive = await fileStore.loadStoreArchive(2, 'configs');

    const archivedFileGroup = await configArchive.getFile(10) as FileGroup;

    // @TODO very broken
    console.log(await archivedFileGroup.packFolder());
})();


