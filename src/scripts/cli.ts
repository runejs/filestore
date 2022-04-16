import { hideBin } from 'yargs/helpers';
import yargs from 'yargs/yargs';
import { ArgumentsCamelCase, Options } from 'yargs';
import { IndexerOptions, indexFiles } from './indexer';
import { unpackFiles, UnpackOptions as UnpackerOptions } from './unpacker';


function cmd<T>(
    name: string, 
    desc: string, 
    options: { [key: string]: Options },
    executor: (argv: ArgumentsCamelCase<T>) => void | Promise<void>,
): void {
    yargs(hideBin(process.argv))
        .command<T>(name, desc, (yargs) => yargs, async (argv) => {
            await executor(argv);
        })
        .options(options)
        .parse();
}


cmd<IndexerOptions>('index', 'index all files within a file store', {
    dir: {
        alias: 'd', type: 'string', default: './',
        description: `The store root directory. Defaults to the current location.`
    },
    format: {
        alias: 'f', type: 'string', default: 'unpacked', choices: [ 'unpacked', 'packed', 'flat', 'js5' ],
        description: `The format of the store to index, either 'unpacked' (flat files) or 'packed' (JS5 format). Defaults to 'unpacked'.`
    },
    archive: {
        alias: 'a', type: 'string', default: 'main',
        description: `The archive to index. Defaults to 'main', which will index all store archives one by one. Specify an archive name to index a single archive.`
    },
    build: {
        alias: 'b', type: 'string', default: '435',
        description: `The game build (revision) that the store should belong to, also known as the game build number. Defaults to '435', a game build from late October, 2006.`
    }
}, async (argv) => {
    await indexFiles(argv);
});


cmd<UnpackerOptions>('unpack', 'unpack and index all files within a file store', {
    dir: {
        alias: 'd', type: 'string', default: './',
        description: `The store root directory. Defaults to the current location.`
    },
    archive: {
        alias: 'a', type: 'string', default: 'main',
        description: `The archive to index. Defaults to 'main', which will unpack and index all store archives one by one. Specify an archive name to unpack a single archive.`
    },
    build: {
        alias: 'b', type: 'string', default: '435',
        description: `The game build (revision) that the store should belong to, also known as the game build number. Defaults to '435', a game build from late October, 2006.`
    },
    debug: {
        type: 'boolean', default: false,
        description: `Debug mode flag, when set to 'true' will not output any files to the disk. Defaults to 'false'.`
    }
}, async (argv) => {
    await unpackFiles(argv);
});
