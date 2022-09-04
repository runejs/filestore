import { join } from 'path';
import { existsSync, mkdirSync } from 'graceful-fs';
import { Connection, createConnection, LoggerOptions, Repository } from 'typeorm';
import { IndexDatabase } from '../index-database';
import { Js5IndexEntity } from './js5-index-entity';
import { Js5FileType } from '../../config';
import { Js5DataEntity } from './js5-data-entity';


export interface Js5IndexEntityWhere {
    fileType?: Js5FileType;
    key?: number;
    name?: string;
    archiveKey?: number;
    groupKey?: number;
}


export class Js5Database extends IndexDatabase<Js5IndexEntity, Js5IndexEntityWhere> {

    private _dataRepo: Repository<Js5DataEntity>;

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
            entities: [ Js5IndexEntity, Js5DataEntity ],
            synchronize: true,
            logging: this.loggerOptions,
            name: 'js5-repository'
        });

        this._repository = this._connection.getRepository(Js5IndexEntity);
        this._dataRepo = this._connection.getRepository(Js5DataEntity);

        return this._connection;
    }

    async getUncompressedData(where: Js5IndexEntityWhere): Promise<Js5DataEntity> {
        return this._dataRepo.findOne({
            where: {
                gameBuild: this.gameBuild,
                compressed: false,
                ...where
            }
        });
    }

    async getAllUncompressedData(where: Js5IndexEntityWhere): Promise<Js5DataEntity[]> {
        return this._dataRepo.find({
            where: {
                gameBuild: this.gameBuild,
                compressed: false,
                ...where
            }
        });
    }

    async saveUncompressedData(uncompressedDataEntity: Js5DataEntity): Promise<Js5DataEntity> {
        return this._dataRepo.save({ ...uncompressedDataEntity, compressed: false });
    }

    async saveAllUncompressedData(uncompressedDataEntities: Js5DataEntity[]): Promise<void> {
        await this._dataRepo.save({ ...uncompressedDataEntities, compressed: false }, {
            chunk: 500,
            transaction: false,
            reload: false,
            listeners: false,
        });
    }

    async upsertAllUncompressedData(uncompressedDataEntities: Js5DataEntity[]): Promise<void> {
        const chunkSize = 100;
        for (let i = 0; i < uncompressedDataEntities.length; i += chunkSize) {
            const chunk = uncompressedDataEntities.slice(i, i + chunkSize).map(d => ({ ...d, compressed: false }));
            await this._dataRepo.upsert(chunk, {
                conflictPaths: [ 'fileType', 'gameBuild', 'key', 'archiveKey', 'groupKey', 'compressed' ],
                skipUpdateIfNoValuesChanged: true,
            });
        }
    }

    async getCompressedData(where: Js5IndexEntityWhere): Promise<Js5DataEntity> {
        return this._dataRepo.findOne({
            where: {
                gameBuild: this.gameBuild,
                compressed: true,
                ...where
            }
        });
    }

    async getAllCompressedData(where: Js5IndexEntityWhere): Promise<Js5DataEntity[]> {
        return this._dataRepo.find({
            where: {
                gameBuild: this.gameBuild,
                compressed: true,
                ...where
            }
        });
    }

    async saveCompressedData(compressedDataEntity: Js5DataEntity): Promise<Js5DataEntity> {
        return this._dataRepo.save({ ...compressedDataEntity, compressed: true });
    }

    async saveAllCompressedData(compressedDataEntities: Js5DataEntity[]): Promise<void> {
        await this._dataRepo.save({ ...compressedDataEntities, compressed: true }, {
            chunk: 500,
            transaction: false,
            reload: false,
            listeners: false,
        });
    }

    async upsertAllCompressedData(compressedDataEntities: Js5DataEntity[]): Promise<void> {
        const chunkSize = 100;
        for (let i = 0; i < compressedDataEntities.length; i += chunkSize) {
            const chunk = compressedDataEntities.slice(i, i + chunkSize).map(d => ({ ...d, compressed: true }));
            await this._dataRepo.upsert(chunk, {
                conflictPaths: [ 'fileType', 'gameBuild', 'key', 'archiveKey', 'groupKey', 'compressed' ],
                skipUpdateIfNoValuesChanged: true,
            });
        }
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

    get dataRepo(): Repository<Js5DataEntity> {
        return this._dataRepo;
    }

}
