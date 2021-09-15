import { join } from 'path';
import { logger } from '@runejs/common';
import { Js5Store } from '@runejs/js5';
import { createObject } from './util/objects';
import { run } from './util/cmd';
import { DecompressorOptions, Js5Decompressor } from './js5';


class UnpackOptions {

    public store: string = join('..', 'store');
    public skipXtea: boolean = false;
    public matchMapFiles: boolean = false;
    public debug: boolean = false;
    public archive: string = 'main';
    public version: number = -1;

    public static create(options?: Partial<UnpackOptions>): UnpackOptions {
        return createObject<UnpackOptions>(UnpackOptions, options, true);
    }

}


run(async args => {
    const {
        debug,
        matchMapFiles,
        archive,
        store: storePath,
        skipXtea,
        version: gameVersion
    } = UnpackOptions.create(args as any);

    const outputPath = join(storePath, 'output');

    const decompressionOptions = DecompressorOptions.create({
        matchMapFiles,
        debug,
        outputPath
    });

    const store = new Js5Store({
        storePath,
        xteaDisabled: skipXtea,
        gameVersion: gameVersion !== -1 ? gameVersion : undefined
    });

    const decompressor = new Js5Decompressor(store, decompressionOptions);
    const argDebugString = args.size !== 0 ? Array.from(args.entries())
        .map(([ key, val ]) => `${key} = ${val}`).join(', ') : '';

    if(archive === 'main') {
        logger.info(`Unpacking JS5 file store${args.size !== 0 ? ` with arguments:` : `...`}`);
        if(args.size !== 0) {
            logger.info(argDebugString);
        }

        decompressor.decompressStore();
    } else {
        logger.info(`Unpacking JS5 archive ${archive}${args.size !== 0 ? ` with arguments:` : `...`}`);
        if(args.size !== 0) {
            logger.info(argDebugString);
        }

        decompressor.decompressArchive(archive);
    }
});
