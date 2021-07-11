import { FileGroup, FileStore } from './file-store';
import { logger } from '@runejs/core';
import { FileCodec } from './codec/file-codec';
import { ByteBuffer } from '@runejs/core/buffer';


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

    await fileStore.indexedArchives.get(2).unpack();

    const itemFile = fileStore.indexedArchives.get(2).files[10] as FileGroup;
    const itemId = 1042;
    const fileData = await itemFile.files[itemId].async('nodebuffer');

    console.log(fileData);

    const itemFileCodec = new FileCodec('item-codec-v3.json5');

    itemFileCodec.decodeBinaryFile(itemId, new ByteBuffer(fileData));

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
