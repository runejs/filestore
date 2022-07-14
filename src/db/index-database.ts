import { Connection, createConnection, LoggerOptions, Repository } from 'typeorm';
import { join } from 'path';
import { existsSync, mkdirSync } from 'graceful-fs';
import { IndexEntity } from './index-entity';
import { FileType } from '../config/file-type';


export class IndexDatabase {

    private readonly gameBuild: string;
    private readonly databasePath: string;
    private readonly loggerOptions: LoggerOptions;

    private _connection: Connection;
    private _repository: Repository<IndexEntity>;

    constructor(gameBuild: string, databasePath: string, loggerOptions: LoggerOptions = 'all') {
        this.gameBuild = gameBuild;
        this.databasePath = databasePath;
        // [ 'error', 'warn' ], 'all', etc...
        this.loggerOptions = loggerOptions;
    }

    async openConnection(): Promise<Connection> {
        if(!existsSync(this.databasePath)) {
            mkdirSync(this.databasePath, { recursive: true });
        }

        this._connection = await createConnection({
            type: 'better-sqlite3',
            database: join(this.databasePath, `${this.gameBuild}.index.sqlite3`),
            entities: [ IndexEntity ],
            synchronize: true,
            logging: this.loggerOptions,
            name: 'index-repository'
        });

        this._repository = this._connection.getRepository(IndexEntity);

        return this._connection;
    }

    // @todo bulk save - 07/13/22 - Kiko
    async saveIndex(indexEntity: IndexEntity): Promise<IndexEntity> {
        return await this.repository.save(indexEntity);
    }

    async getIndex(fileType: FileType, key: number, parentKey: number): Promise<IndexEntity> {
        return await this.repository.findOne({
            where: { fileType, key, parentKey }
        }) || null;
    }

    get connection(): Connection {
        return this._connection;
    }

    get repository(): Repository<IndexEntity> {
        return this._repository;
    }

    get loaded(): boolean {
        return !!this._connection;
    }

}
