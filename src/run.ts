import { FileStore, FlatFile } from './file-store';
import { logger } from '@runejs/core';
import mapCodec from '../codec/map-codec';


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




    const start = Date.now();

    const fileStore = new FileStore();
    await fileStore.loadStoreArchives();

    // await fileStore.indexedArchives.get(5).unpack();

    const mapFile = await fileStore.indexedArchives.get(5).loadFile(382, true) as FlatFile;

    console.log(mapFile.fileData);

    const mapData = mapCodec.decode(mapFile.fileData);

    // console.log(mapData);

    console.log(mapCodec.encode(mapData));

    // const itemFileCodec = new FileCodec('item-codec-v3.json5');
    // itemFileCodec.decodeBinaryFile(itemId, new ByteBuffer(fileData));

    /*for(let i = 0; i < fileStore.indexedArchives.size; i++) {
        logger.info(`Indexing archive ${i}...`);
        if(i === 5 || i === 7) {
            await fileStore.indexedArchives.get(i).indexArchiveFiles();
        }
    }*/

    // await fileStore.generateCrcTable();

    // await fileStore.indexedArchives.get(8).unpack();

    const end = Date.now();
    const duration = end - start;

    logger.info(`Operations completed in ${duration / 1000} seconds.`);
})();
