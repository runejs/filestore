import { FileGroup, FileStore } from './file-store';
import { logger } from '@runejs/core';
import { run } from './util/cmd';
import { SpriteStorageMethod } from './transcoders/sprites';
import spriteCodec from './transcoders/sprites/sprite.transcoder';
import fs from 'fs';
import { ConfigStore } from './client-store';


const indexArchives = async (fileStore: FileStore): Promise<void> => {
    for(const [ index, archive ] of fileStore.indexedArchives) {
        logger.info(`Indexing archive ${index}...`);
        await archive.indexArchiveFiles();
    }
};

const unpackArchives = async (fileStore: FileStore, loadFileData: boolean, compressFileData: boolean): Promise<void> => {
    for(const [ index, archive ] of fileStore.indexedArchives) {
        logger.info(`Unpacking archive ${index}...`);
        await archive.unpack(loadFileData, compressFileData);
    }
};

const spriteTest = (): void => {
    ([
        [ 780, 'sideicons_interface,6', 'row-major' ],
        [ 781, 'sideicons_interface,7', 'column-major' ],
        // [ 460, 'painting2', 'row-major' ],
        // [ 213, 'staticons,16', 'column-major' ],
        // [ 203, 'staticons,6', 'row-major' ]
    ] as [ number, string, SpriteStorageMethod ][]).forEach(file => {
        const [ fileIndex, fileName, storageType ] = file;
        logger.info(`Original: ${storageType}`);
        const spriteFile: Buffer = fs.readFileSync(`../stores/sprites/${fileName}.png`);
        spriteCodec.encode({ fileIndex, fileName }, spriteFile, {
            debug: true,
            forceStorageMethod: storageType
        });
        logger.info('\n');
    });
};

const configTest = async (fileStore: FileStore): Promise<void> => {
    const configArchive = fileStore.getArchive('config');
    await configArchive.unpack(true, false);
    const configStore = new ConfigStore(fileStore);

    const objectMap = configStore.objectStore.decodeObjectStore();
    logger.info(`${objectMap.size} objects found.`);

    const itemMap = configStore.itemStore.decodeItemStore();
    logger.info(`${itemMap.size} items found.`);

    const npcMap = configStore.npcStore.decodeNpcStore();
    logger.info(`${npcMap.size} npcs found.`);

    const bankBooth = objectMap.get('2213');
    console.log(JSON.stringify(bankBooth, null, 4));

    const partyhat = itemMap.get('1038');
    console.log(JSON.stringify(partyhat, null, 4));

    const hans = npcMap.get('0');
    console.log(JSON.stringify(hans, null, 4));
};


run(async args => {
    const fileStore = new FileStore();
    await fileStore.loadAllArchives();

    // await indexArchives(fileStore);
    await unpackArchives(fileStore, true, true);

    await fileStore.generateMainIndexFile();

    // validateSpriteFormats(`D:/rsdev`);
    // spriteTest();

    // configTest(fileStore);
});
