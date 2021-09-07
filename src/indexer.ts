import { join } from 'path';
import { logger } from '@runejs/core';
import { createObject } from './util/objects';
import { ArchiveName, IndexName } from './file-store';
import { run } from './util/cmd';
import { FlatFileStore } from './flat-file-store/flat-file-store';


class IndexerOptions {

    public stores: string = join('..', 'stores');
    public config: string = join('.', 'config');
    public output: string = join('.', 'output');
    public debug: boolean = false;
    public compress: boolean = false;
    public archive: IndexName = 'main';

    public static create(options?: Partial<IndexerOptions>): IndexerOptions {
        return createObject<IndexerOptions>(IndexerOptions, options, true);
    }

}


run(async args => {
    const options = IndexerOptions.create(args as any);
    const argDebugString = args.size !== 0 ? Array.from(args.entries()).map(([ key, val ]) => `${key} = ${val}`).join(', ') : '';

    const flatFileStore = new FlatFileStore({
        storePath: options.stores,
        configPath: options.config,
        outputPath: options.output,
    });

    if(options.archive === 'main') {
        logger.info(`Indexing flat file store${args.size !== 0 ? ` with arguments:` : `...`}`);
        if(args.size !== 0) {
            logger.info(argDebugString);
        }

        flatFileStore.readFlatFileStore(options.compress);

        /*const archives = await flatFileStore.getAllArchives();
        for(const [ , archive ] of archives) {
            logger.info(`Indexing archive ${archive.archiveName}...`);
            await archive.indexArchiveFiles();
        }*/
    } else {
        const archiveName: ArchiveName = options.archive as ArchiveName;
        logger.info(`Indexing flat file store archive ${archiveName}${args.size !== 0 ? ` with arguments:` : `...`}`);
        if(args.size !== 0) {
            logger.info(argDebugString);
        }

        const archive = await flatFileStore.getArchive(archiveName);
        await archive.readArchiveContents(options.compress);
    }
});
