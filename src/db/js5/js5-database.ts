import { IndexDatabase } from '../index-database';
import { Js5IndexEntity } from './js5-index-entity';
import { Connection, createConnection, LoggerOptions } from 'typeorm';
import { Js5FileType } from '../../config';
import { existsSync, mkdirSync } from 'graceful-fs';
import { join } from 'path';


export interface Js5IndexEntityWhere {
    fileType?: Js5FileType;
    key?: number;
    name?: string;
    archiveKey?: number;
    groupKey?: number;
}


export class Js5Database extends IndexDatabase<Js5IndexEntity, Js5IndexEntityWhere> {

    constructor(
        gameBuild: string,
        databasePath: string,
        loggerOptions: LoggerOptions = 'all'
    ) {
        super(gameBuild, databasePath, loggerOptions);
    }

    override async openConnection(): Promise<Connection> {
        if(!existsSync(this.databasePath)) {
            mkdirSync(this.databasePath, { recursive: true });
        }

        this._connection = await createConnection({
            type: 'better-sqlite3',
            database: join(this.databasePath, `${this.gameBuild}.index.sqlite3`),
            entities: [ Js5IndexEntity ],
            synchronize: true,
            logging: this.loggerOptions,
            name: 'js5-index-repository'
        });

        this._repository = this._connection.getRepository(Js5IndexEntity);

        return this._connection;
    }

    override async upsertIndexes(indexEntities: Js5IndexEntity[]): Promise<void> {
        const chunkSize = 100;
        for (let i = 0; i < indexEntities.length; i += chunkSize) {
            const chunk = indexEntities.slice(i, i + chunkSize);
            await this.repository.upsert(chunk, {
                conflictPaths: [ 'fileType', 'gameBuild', 'key', 'archiveKey', 'groupKey' ],
                skipUpdateIfNoValuesChanged: true,
            });
        }
    }

}
