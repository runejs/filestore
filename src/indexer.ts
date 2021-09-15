import { join } from 'path';
import { logger } from '@runejs/common';
import { createObject } from './util/objects';
import { run } from './util/cmd';
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

        /*const archives = await flatFileStore.getAllArchives();
        for(const [ , archive ] of archives) {
            logger.info(`Indexing archive ${archive.archiveName}...`);
            await archive.indexArchiveFiles();
        }*/
    } else {
        logger.info(`Indexing flat file store archive ${options.archive}${args.size !== 0 ? ` with arguments:` : `...`}`);
        if(args.size !== 0) {
            logger.info(argDebugString);
        }

        const archive = await flatFileStore.getArchive(options.archive);
        await archive.readFiles(options.compress);
    }
});
