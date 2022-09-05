import { Connection, createConnection, LoggerOptions, Repository } from 'typeorm';
import { join } from 'path';
import { existsSync, mkdirSync } from 'graceful-fs';


export abstract class IndexDatabase<ENTITY, WHERE = any> {

    protected readonly gameBuild: string;
    protected readonly databasePath: string;
    protected readonly loggerOptions: LoggerOptions;

    protected _connection: Connection;
    protected _repository: Repository<ENTITY>;

    protected constructor(
        gameBuild: string,
        databasePath: string,
        loggerOptions: LoggerOptions = 'all'
    ) {
        this.gameBuild = gameBuild;
        this.databasePath = databasePath;
        // [ 'error', 'warn' ], 'all', etc...
        this.loggerOptions = loggerOptions;
    }

    abstract openConnection(): Promise<Connection>;

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
