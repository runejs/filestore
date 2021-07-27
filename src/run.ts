import { FileStore } from './file-store';
import { logger } from '@runejs/core';
import spriteCodec from './codec/archives/sprite.codec';
import { ClientFileStore, loadXteaRegionFiles } from './client-store';
import * as fs from 'fs';
import path from 'path';
import { PNG } from 'pngjs';
import { ByteBuffer } from '@runejs/core/buffer';
import { IndexedFile } from './file-store/file';


(async () => {
    const start = Date.now();

    const xteaRegions = async () => loadXteaRegionFiles('config/xteas');

    const clientFileStore = new ClientFileStore('./packed', {
        configDir: './config',
        xteas: await xteaRegions()
    });

    // Decode a packed client cache with this vvv
    // await clientFileStore.decompressArchives(false);

    // Decode a single packed client cache archive with this line vvv
    await clientFileStore.getIndex('sprites').decompressArchive();





    const fileStore = new FileStore();
    // await fileStore.loadStoreArchives();

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

    /*
    @TODO vvv Cleanup Sprite Codec Testing
    await fileStore.getArchive('sprites').unpack(true, false);

    const spriteArchive = fileStore.getArchive('sprites');
    const spriteKeys = Object.keys(spriteArchive.files);

    const spritesDir = path.join('output', 'sprites');
    if(fs.existsSync(spritesDir)) {
        fs.rmSync(spritesDir, { recursive: true });
    }

    fs.mkdirSync(spritesDir, { recursive: true });

    for(const spriteKey of spriteKeys) {
        const sprite: IndexedFile = spriteArchive.files[spriteKey];
        if(sprite.fileData) {
            const image = spriteCodec.decode(sprite.fileData);

            try {
                image.pack();

                const pngBuffer = PNG.sync.write(image);
                fs.writeFileSync(path.join(spritesDir, `${sprite.fileName}.png`), pngBuffer);
            } catch(error) {
                logger.error(`Error writing sprite ${spriteKey}.`);
            }
        }
    }
    const sprite = fileStore.getArchive('sprites').files[494].fileData;*/

    const end = Date.now();
    const duration = end - start;
    logger.info(`Operations completed in ${duration / 1000} seconds.`);
})();
