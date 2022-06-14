import express from 'express';
import { fileTarget, logger, prettyPrintTarget } from '@runejs/common';
import { Store } from '../store';


logger.setTargets([
    prettyPrintTarget(),
    fileTarget('./logs/server.log')
]);

const app = express();
let store: Store;


app.set('port', 8080);

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
});

app.get('/archives/:archiveKey/groups/:groupKey', (req, res, next) => {
    const { archiveKey, groupKey } = req.params;
    logger.info(`/archives/${archiveKey}/groups/${groupKey}`);

    let groupName = null;
    if (!/^[0-9]*$/.test(groupKey)) {
        groupName = groupKey;
    }

    try {
        const archive = store.get(archiveKey);
        if (!archive) {
            throw new Error(`Archive ${archiveKey} was not found.`);
        }

        const group = groupName ? archive.find(groupName) : archive.get(groupKey);
        if (!group) {
            throw new Error(`Group ${groupKey} was not found within Archive ${archiveKey}.`);
        }

        const data = group.data.toNodeBuffer();
        // const data = group.index.data;

        if(archiveKey === '8') {
            logger.info(`archive compression = ${ archive.compression }, group compression = ${ group.compression }`);
            logger.info(JSON.stringify(data).slice(0, 100));
        }

        res.writeHead(200, {
            'Content-Type': 'arraybuffer',
            'Content-Length': data.length,
        });

        res.end(data);
    } catch (error) {
        next(error);
    }
});

app.get('/archives/:archiveKey', (req, res, next) => {
    const { archiveKey } = req.params;
    logger.info(`/archives/${archiveKey}`);
    try {
        const archive = store.get(archiveKey);
        if (!archive) {
            throw new Error(`Archive ${archiveKey} was not found.`);
        }

        const data = archive.data.toNodeBuffer();

        res.writeHead(200, {
            'Content-Type': 'arraybuffer',
            'Content-Length': data.length,
        });

        res.end(data);
    } catch (error) {
        next(error);
    }
});

app.get('/config', (req, res, next) => {
    logger.info(`/config`);
    try {
        res.status(200).contentType('json').send(store.archiveConfig);
    } catch (error) {
        next(error);
    }
});

app.listen(app.get('port'), async () => {
    store = await Store.create('440', './');
    store.loadPackedStore();
    store.decode(true);
    // await store.read(false, false);
    // store.archives.forEach(archive => archive.decompress());
    logger.info('FileStore HTTP server online.');
});
