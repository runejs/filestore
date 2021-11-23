import fs from 'graceful-fs';
import { join } from 'path';
import { logger } from '@runejs/common';
import { run } from './util';
import { SpriteStorageMethod } from './transcoders/sprites';
import spriteCodec from './transcoders/sprites/sprite.transcoder';
import mapCodec from './transcoders/maps/map.transcoder';
import { FlatFileStore } from './flat-file-store';
import { Js5Store } from './js5';


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


const createFlatFileStore = () => {
    return new FlatFileStore({
        storePath: join('..', 'store'),
        gameVersion: 435
    });
};


const createJs5FileStore = () => {
    return new Js5Store({
        storePath: join('..', 'store'),
        xteaDisabled: false,
        gameVersion: 435
    });
};


run(async args => {
    // validateSpriteFormats(`D:/rsdev`);
    // spriteTest();
    // configTest(fileStore);

    const flatFileStore = createFlatFileStore();
    const js5FileStore = createJs5FileStore();

    const mapsArchive = flatFileStore.getArchive('maps');
    mapsArchive.readFiles(false);

    const flatFileGroup = mapsArchive.getGroup(3); // l45_73 landscape file
    flatFileGroup.compress();

    const js5MapsArchive = js5FileStore.findArchive('maps');
    js5MapsArchive.decode();
    const js5FileGroup = js5MapsArchive.getGroup(3);
    js5FileGroup.decompress();
    js5FileGroup.compress();

    const flatFileData = flatFileGroup.data;
    const js5FileData = js5FileGroup.data;

    console.log(flatFileData);
    console.log(js5FileData);
});
