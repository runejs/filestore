import { FileStore } from './file-store';
import { logger } from '@runejs/core';
import mapCodec from './codec/maps/map-codec';
import { ClientFileStore, loadXteaRegionFiles } from './client-store';


(async () => {
    const start = Date.now();

    const xteaRegions = async () => loadXteaRegionFiles('config/xteas');

    const clientFileStore = new ClientFileStore('./packed', {
        configDir: './config',
        xteas: await xteaRegions()
    });

    // Decode a packed client cache with this line vvv
    clientFileStore.getAllIndexes().forEach(index => index.decompressArchive(false));

    // Decode a single packed client cache archive with this line vvv
    // await clientFileStore.getIndex(0).decompressArchive();





    const fileStore = new FileStore();
    await fileStore.loadStoreArchives();

    // await fileStore.indexedArchives.get(5).unpack();

    /*const mapArchive = await fileStore.getArchive(5);
    const mapFile = await mapArchive.loadFile(382, true) as FlatFile;

    console.log(mapFile.fileData);

    const mapData = mapCodec.decode(mapFile.fileData);

    console.log(mapData);

    console.log(mapCodec.encode(mapData));*/

    // const itemFileCodec = new FileCodec('item-codec-v3.json5');
    // itemFileCodec.decodeBinaryFile(itemId, new ByteBuffer(fileData));

    /*for(let i = 0; i < fileStore.indexedArchives.size; i++) {
        // logger.info(`Unpacking archive ${i}...`);
        logger.info(`Indexing archive ${i}...`);
        await fileStore.indexedArchives.get(i).indexArchiveFiles();
    }*/

    // await fileStore.generateCrcTable();

    // await fileStore.getArchive('configs').unpack(true, true);

    const end = Date.now();
    const duration = end - start;
    logger.info(`Operations completed in ${duration / 1000} seconds.`);
})();
