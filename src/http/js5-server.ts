import express, { Response } from 'express';
import { logger } from '@runejs/common';
import { Js5FileStore } from '../file-system/js5';
import { ArgumentOptions, ScriptExecutor } from '../scripts/script-executor';
import { constants as http2 } from 'http2';
import { Js5IndexEntity } from '../db/js5';


interface ServerOptions {
    build: string;
    dir: string;
    port: number;
}


const serverArgumentOptions: ArgumentOptions = {
    build: {
        alias: 'b',
        type: 'string',
        default: '435',
        description: `The game build (revision) that the store should belong to, also known as the game build number. Defaults to '435', a game build from late October, 2006.`
    },
    dir: {
        alias: 'd',
        type: 'string',
        default: './',
        description: `The store root directory. Defaults to the current location.`
    },
    port: {
        alias: 'p',
        type: 'number',
        default: 8080,
        description: `The port from which the HTTP server will be accessed. Defaults to 8080.`
    },
};


const handleError = (res: Response, status: number, msg: string) => {
    logger.error(msg);
    res.status(status).send();
};


const keyOrName = (input: string): string | number => {
    if (/^\d+$/.test(input)) {
        return Number(input);
    } else {
        return input;
    }
};


const writeFile = (res: Response, index: Js5IndexEntity, compressed: boolean = true) => {
    res.writeHead(200, {
        'Content-Type': 'arraybuffer',
        'Content-Length': compressed ? index.compressedData.length : index.data.length,
        'Content-disposition': `attachment; filename=${index.name || index.key}`
    });

    res.end(compressed ? index.compressedData : index.data);
};


const app = express();
let store: Js5FileStore;


app.get('/archives/:archiveKey/groups/:groupKey/files/:fileKey', (req, res, next) => {
    const { archiveKey, groupKey, fileKey } = req.params;
    logger.info(`Request /archives/${archiveKey}/groups/${groupKey}/files/${fileKey}`);

    const archive = store.getArchive(keyOrName(archiveKey));
    if (!archive) {
        handleError(res, http2.HTTP_STATUS_NOT_FOUND, `Archive ${archiveKey} was not found.`);
        return;
    }

    const group = archive.getGroup(keyOrName(groupKey));
    if (!group) {
        handleError(res, http2.HTTP_STATUS_NOT_FOUND, `Group ${groupKey} was not found within Archive ${archiveKey}.`);
        return;
    }

    const file = group.getFile(keyOrName(fileKey));
    if (!file || !file.index.data?.length) {
        handleError(res, http2.HTTP_STATUS_NOT_FOUND, `File ${groupKey}:${fileKey} was not found within Archive ${archiveKey}.`);
        return;
    }

    writeFile(res, file.index, false);
});

app.get('/archives/:archiveKey/groups/:groupKey', (req, res, next) => {
    const { archiveKey, groupKey } = req.params;
    logger.info(`Request /archives/${archiveKey}/groups/${groupKey}`);

    const archive = store.getArchive(keyOrName(archiveKey));
    if (!archive) {
        handleError(res, http2.HTTP_STATUS_NOT_FOUND, `Archive ${archiveKey} was not found.`);
        return;
    }

    const group = archive.getGroup(keyOrName(groupKey));
    if (!group || !group.index.compressedData?.length) {
        handleError(res, http2.HTTP_STATUS_NOT_FOUND, `Group ${groupKey} was not found within Archive ${archiveKey}.`);
        return;
    }

    writeFile(res, group.index);
});

app.get('/archives/:archiveKey/groups', (req, res, next) => {
    const { archiveKey } = req.params;
    logger.info(`Request /archives/${archiveKey}/groups`);

    const archive = store.getArchive(keyOrName(archiveKey));
    if (!archive) {
        handleError(res, http2.HTTP_STATUS_NOT_FOUND, `Archive ${archiveKey} was not found.`);
        return;
    }

    const groupDetails = Array.from(archive.groups.values()).map(group => ({
        key: group.index.key,
        name: group.index.name,
        nameHash: group.index.nameHash,
        childCount: group.index.childCount,
        children: Array.from(group.files.values()).map(file => ({
            key: file.index.key,
            name: file.index.name,
            nameHash: file.index.nameHash,
        }))
    }));

    res.send(groupDetails);
});

app.get('/archives/:archiveKey', (req, res, next) => {
    const { archiveKey } = req.params;

    logger.info(`Request /archives/${archiveKey}`);

    const archive = store.getArchive(keyOrName(archiveKey));
    if (!archive || !archive.index.compressedData?.length) {
        handleError(res, http2.HTTP_STATUS_NOT_FOUND, `Archive ${archiveKey} was not found.`);
        return;
    }

    writeFile(res, archive.index);
});

app.get('/archives', (req, res) => {
    logger.info(`Request /archives`);

    const archives = Array.from(store.archives.values());

    const archiveList: Record<string, unknown>[] = [];

    for (const archive of archives) {
        archiveList.push({
            key: archive.index.key,
            name: archive.index.name,
            childCount: archive.index.childCount,
            loadedChildCount: archive.groups.size,
        });
    }

    res.send(archiveList);
});

app.get('/config', (req, res, next) => {
    logger.info(`Request /config`);
    res.status(200).contentType('json').send(store.archiveConfig);
});


new ScriptExecutor().executeScript<ServerOptions>(serverArgumentOptions, async (
    { build, dir, port }
) => {
    app.use((req, res, next) => {
        res.header('Access-Control-Allow-Origin', '*');
        res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
        next();
    });

    app.set('json spaces', 4);
    app.set('port', port);
    app.set('dir', dir);
    app.set('build', build);

    app.listen(port, async () => {
        const start = Date.now();

        store = new Js5FileStore(build, dir);
        await store.load(true, true, true);

        const end = Date.now();

        logger.info(`File Store loaded in ${(end - start) / 1000} seconds.`);
        logger.info('HTTP server online.');
    });
});

