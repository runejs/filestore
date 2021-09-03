import { loadXteaRegionFiles } from './util';
import { ClientFileStore } from './client-store';
import { logger } from '@runejs/core';
import { createObject } from './util/objects';
import { ArchiveName, IndexName } from './file-store';
import { run } from './util/cmd';
import { DecompressionOptions } from './client-store/decompression/decompression-options';
import { ArchiveDecompressor } from './client-store/decompression/archive-decompressor';


class UnpackOptions {

    public cache: string = './packed';
    public config: string = './config';
    public skipXtea: boolean = false;
    public matchMapFiles: boolean = false;
    public writeFileNames: boolean = false;
    public debug: boolean = false;
    public archive: IndexName = 'main';

    public static create(options?: Partial<UnpackOptions>): UnpackOptions {
        return createObject<UnpackOptions>(UnpackOptions, options, true);
    }

}


run(async args => {
    const options = UnpackOptions.create(args as any);
    const xteaKeys = await loadXteaRegionFiles(`config/xteas`);

    const clientFileStore = new ClientFileStore(options.cache, {
        configDir: options.config,
        xteaKeys: !options.skipXtea ? xteaKeys : {}
    });

    const decompressionOptions = DecompressionOptions.create({
        matchMapFiles: options.matchMapFiles,
        debug: options.debug
    });

    const argDebugString = args.size !== 0 ? Array.from(args.entries()).map(([ key, val ]) => `${key} = ${val}`).join(', ') : '';

    if(options.archive === 'main') {
        logger.info(`Unpacking JS5 file store${args.size !== 0 ? ` with arguments:` : `...`}`);
        if(args.size !== 0) {
            logger.info(argDebugString);
        }
        await clientFileStore.decompressArchives(decompressionOptions);
    } else {
        const archiveName: ArchiveName = options.archive as ArchiveName;
        logger.info(`Unpacking JS5 archive ${archiveName}${args.size !== 0 ? ` with arguments:` : `...`}`);
        if(args.size !== 0) {
            logger.info(argDebugString);
        }
        await clientFileStore.getArchive(archiveName).decompressArchive(decompressionOptions);
    }

    if(options.writeFileNames) {
        await ArchiveDecompressor.writeFileNames();
    }
});
