import { logger } from '@runejs/core';
import { run } from './util/cmd';
import { SpriteStorageMethod } from './transcoders/sprites';
import spriteCodec from './transcoders/sprites/sprite.transcoder';
import fs from 'fs';


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


run(async args => {
    // validateSpriteFormats(`D:/rsdev`);
    // spriteTest();

    // configTest(fileStore);
});
