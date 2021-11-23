import { join } from 'path';
import { logger } from '@runejs/common';
import { run, createObject } from './util';
import { FlatFileStore } from './flat-file-store';


class IndexerOptions {

    public store: string = join('..', 'store');
    public debug: boolean = false;
    public compress: boolean = false;
    public archive: string = 'main';

    public static create(options?: Partial<IndexerOptions>): IndexerOptions {
        return createObject<IndexerOptions>(IndexerOptions, options, true);
    }

}


run(async args => {
    const options = IndexerOptions.create(args as any);
    const argDebugString = args.size !== 0 ? Array.from(args.entries()).map(([ key, val ]) => `${key} = ${val}`).join(', ') : '';

    const flatFileStore = new FlatFileStore({
        storePath: options.store
    });

    if(options.archive === 'main') {
        logger.info(`Indexing flat file store${args.size !== 0 ? ` with arguments:` : `...`}`);
        if(args.size !== 0) {
            logger.info(argDebugString);
        }

        flatFileStore.readStore(options.compress);
    } else {
        logger.info(`Indexing flat file store archive ${options.archive}${args.size !== 0 ? ` with arguments:` : `...`}`);
        if(args.size !== 0) {
            logger.info(argDebugString);
        }

        const archive = await flatFileStore.getArchive(options.archive);
        archive.readFiles(options.compress);
        archive.writeArchiveIndexFile();
    }
});
