import { Connection, createConnection, LoggerOptions, Repository } from 'typeorm';
import { join } from 'path';
import { existsSync, mkdirSync } from 'graceful-fs';


export abstract class IndexDatabase<ENTITY, WHERE = any> {

    protected readonly gameBuild: string;
    protected readonly databasePath: string;
    protected readonly loggerOptions: LoggerOptions;
    protected readonly entityType: new () => ENTITY;

    protected _connection: Connection;
    protected _repository: Repository<ENTITY>;

    protected constructor(
        gameBuild: string,
        databasePath: string,
        entityType: new () => ENTITY,
        loggerOptions: LoggerOptions = 'all'
    ) {
        this.gameBuild = gameBuild;
        this.databasePath = databasePath;
        this.entityType = entityType;
        // [ 'error', 'warn' ], 'all', etc...
        this.loggerOptions = loggerOptions;
    }

    abstract upsertIndexes(indexEntities: ENTITY[]): Promise<void>;

    async getIndexes(where: WHERE): Promise<ENTITY[]> {
        return await this.repository.find({
            where: { ...where, gameBuild: this.gameBuild }
        }) || [];
    }

    async getIndex(where: WHERE): Promise<ENTITY> {
        return await this.repository.findOne({
            where: { ...where, gameBuild: this.gameBuild }
        }) || null;
    }

    async saveIndexes(indexEntities: ENTITY[]): Promise<void> {
        await this.repository.save(indexEntities as any, {
            chunk: 500,
            transaction: false,
            reload: false,
            listeners: false,
        });
    }

    async saveIndex(indexEntity: ENTITY): Promise<ENTITY> {
        return await this.repository.save(indexEntity as any);
    }

    async openConnection(): Promise<Connection> {
        if(!existsSync(this.databasePath)) {
            mkdirSync(this.databasePath, { recursive: true });
        }

        this._connection = await createConnection({
            type: 'better-sqlite3',
            database: join(this.databasePath, `${this.gameBuild}.index.sqlite3`),
            entities: [ this.entityType ],
            synchronize: true,
            logging: this.loggerOptions,
            name: 'index-repository'
        });

        this._repository = this._connection.getRepository(this.entityType);

        return this._connection;
    }

    async closeConnection(): Promise<void> {
        await this._connection.close();
    }

    get connection(): Connection {
        return this._connection;
    }

    get repository(): Repository<ENTITY> {
        return this._repository;
    }

    get loaded(): boolean {
        return !!this._connection;
    }

}
