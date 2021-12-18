import { join } from 'path';
import { logger } from '@runejs/common';
import { run, createObject } from './util';
import { Store } from './fs';


class IndexerOptions {

    public store: string = join('..', 'store');
    public debug: boolean = false;
    public compress: boolean = false;
    public archive: string = 'main';
    public version: number = -1;

    public static create(options?: Partial<IndexerOptions>): IndexerOptions {
        return createObject<IndexerOptions>(IndexerOptions, options, true);
    }

}


run(args => {
    const options = IndexerOptions.create(args as any);
    const argDebugString = args.size !== 0 ? Array.from(args.entries()).map(([ key, val ]) => `${key} = ${val}`).join(', ') : '';

    const fileStore = new Store(options.version, options.store, join(options.store, 'output'));

    if(options.archive === 'main') {
        logger.info(`Indexing flat file store${args.size !== 0 ? ` with arguments:` : `...`}`);
        if(args.size !== 0) {
            logger.info(argDebugString);
        }

        fileStore.read(options.compress);
        Array.from(fileStore.archives.values()).forEach(archive => archive.writeIndexFile());
    } else {
        logger.info(`Indexing flat file store archive ${options.archive}${args.size !== 0 ? ` with arguments:` : `...`}`);
        if(args.size !== 0) {
            logger.info(argDebugString);
        }

        fileStore.load();

        const archive = fileStore.find(options.archive);

        archive.read(options.compress);
        archive.writeIndexFile();
    }
});
