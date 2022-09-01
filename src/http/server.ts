import express from 'express';
import { Container } from '@decorators/di';
import { attachControllers } from '@decorators/express';
import { logger } from '@runejs/common';
import { ArgumentOptions, ScriptExecutor } from '../scripts/script-executor';
import { FILESTORE_DIR } from './config';
import { Js5Controller } from './js5/js5.controller';


interface ServerOptions {
    dir: string;
    port: number;
}


const serverArgumentOptions: ArgumentOptions = {
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


new ScriptExecutor().executeScript<ServerOptions>(serverArgumentOptions, async (
    { dir, port }
) => {
    const app = express();

    app.use((req, res, next) => {
        res.header('Access-Control-Allow-Origin', '*');
        res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
        next();
    });

    app.set('json spaces', 4);
    app.set('port', port);

    Container.provide([
        { provide: FILESTORE_DIR, useValue: dir },
    ]);

    attachControllers(app, [ Js5Controller ]);

    app.listen(port, async () => {
        logger.info(`HTTP server listening at port ${port}.`);
    });
});

