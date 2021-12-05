import { join } from 'path';
import { logger, setLoggerDest } from '@runejs/common';
import { run, createObject } from './util';
import { Store } from './fs';


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
        archive,
        store: storePath,
        version: gameVersion
    } = UnpackOptions.create(args as any);

    if(!gameVersion || gameVersion === -1) {
        throw new Error(`Please supply the desired game version to unpack using the --version argument.`)
    }

    const outputPath = join(storePath, 'output');

    setLoggerDest(join(storePath, 'logs', `unpack-${gameVersion}.log`));

    const argDebugString = args.size !== 0 ? Array.from(args.entries())
        .map(([ key, val ]) => `${key} = ${val}`).join(', ') : '';

    const store = new Store(gameVersion, storePath, outputPath);
    store.js5.load();

    if(archive === 'main') {
        logger.info(`Unpacking JS5 file store${args.size !== 0 ? ` with arguments:` : `...`}`);
        if(args.size !== 0) {
            logger.info(argDebugString);
        }

        store.js5Decode();

        if(!debug) {
            store.write();
        } else {
            logger.info(`Flat file store writing is disabled in debug mode.`, `Decoding completed.`);
        }
    } else {
        logger.info(`Unpacking JS5 archive ${archive}${args.size !== 0 ? ` with arguments:` : `...`}`);
        if(args.size !== 0) {
            logger.info(argDebugString);
        }

        const a = store.find(archive);

        if(!a) {
            throw new Error(`Archive ${a} was not found.`);
        }

        a.js5Decode();

        if(!debug) {
            a.write();
        } else {
            logger.info(`Archive writing is disabled in debug mode.`, `Decoding completed.`);
        }
    }
});
