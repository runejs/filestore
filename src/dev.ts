import { FileStore } from './file-store';
import { logger } from '@runejs/core';
import { run } from './util/cmd';


run(async args => {
    // validateSpriteFormats(`D:/rsdev`);

    /*([
        [ 780, 'sideicons_interface,6', 'row-major' ],
        [ 781, 'sideicons_interface,7', 'column-major' ],
        // [ 460, 'painting2', 'row-major' ],
        // [ 213, 'staticons,16', 'column-major' ],
        // [ 203, 'staticons,6', 'row-major' ]
    ] as [ number, string, SpriteStorageMethod ][]).forEach(file => {
        const [ fileIndex, fileName, storageType ] = file;
        console.log(`Original: ${storageType}`);
        const spriteFile: Buffer = fs.readFileSync(`./stores/sprites/${fileName}.png`);
        spriteCodec.encode({ fileIndex, fileName }, spriteFile, {
            debug: true,
            forceStorageMethod: storageType
        });
        console.log('\n');
    });*/

    const fileStore = new FileStore();
    await fileStore.loadStoreArchives();

    for(let i = 0; i < fileStore.indexedArchives.size; i++) {
        // logger.info(`Unpacking archive ${i}...`);
        logger.info(`Indexing archive ${i}...`);
        await fileStore.indexedArchives.get(i).indexArchiveFiles();
    }

    await fileStore.generateCrcTable();

    // await fileStore.indexedArchives.get(5).unpack();

    /*const mapArchive = await fileStore.getArchive(5);
    const mapFile = await mapArchive.loadFile(382, true) as FlatFile;

    console.log(mapFile.fileData);

    const mapData = mapCodec.decode(mapFile.fileData);

    console.log(mapData);

    console.log(mapCodec.encode(mapData));*/

    // const itemFileCodec = new FileCodec('item-codec-v3.json5');
    // itemFileCodec.decodeBinaryFile(itemId, new ByteBuffer(fileData));
});
