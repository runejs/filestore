import { logger } from '@runejs/core';
import { createObject } from './util/objects';
import { run } from './util/cmd';
import { DecompressorOptions } from './js5/decompressor-options';
import { Js5Store } from '@runejs/js5';
import { Js5Decompressor } from './js5/js5-decompressor';


class UnpackOptions {

    public cache: string = './packed';
    public config: string = './config';
    public skipXtea: boolean = false;
    public matchMapFiles: boolean = false;
    public debug: boolean = false;
    public archive: string = 'main';

    public static create(options?: Partial<UnpackOptions>): UnpackOptions {
        return createObject<UnpackOptions>(UnpackOptions, options, true);
    }

}


run(async args => {
    const { debug, matchMapFiles, archive, config, cache, skipXtea } = UnpackOptions.create(args as any);
    const decompressionOptions = DecompressorOptions.create({ matchMapFiles, debug });
    const store = new Js5Store(cache, config);
    const decompressor = new Js5Decompressor(store, decompressionOptions);
    const argDebugString = args.size !== 0 ? Array.from(args.entries()).map(([ key, val ]) => `${key} = ${val}`).join(', ') : '';

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
