import { IndexDatabase } from '../index-database';
import { Js5IndexEntity } from './js5-index-entity';
import { Connection, createConnection, LoggerOptions, Repository } from 'typeorm';
import { Js5FileType } from '../../config';
import { existsSync, mkdirSync } from 'graceful-fs';
import { join } from 'path';
import { Js5UncompressedDataEntity } from './js5-uncompressed-data-entity';
import { Js5CompressedDataEntity } from './js5-compressed-data-entity';


export interface Js5IndexEntityWhere {
    fileType?: Js5FileType;
    key?: number;
    name?: string;
    archiveKey?: number;
    groupKey?: number;
}


export class Js5Database extends IndexDatabase<Js5IndexEntity, Js5IndexEntityWhere> {

    private _uncompressedDataRepo: Repository<Js5UncompressedDataEntity>;
    private _compressedDataRepo: Repository<Js5CompressedDataEntity>;

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
            entities: [ Js5IndexEntity, Js5UncompressedDataEntity, Js5CompressedDataEntity ],
            synchronize: true,
            logging: this.loggerOptions,
            name: 'js5-index-repository'
        });

        this._repository = this._connection.getRepository(Js5IndexEntity);
        this._uncompressedDataRepo = this._connection.getRepository(Js5UncompressedDataEntity);
        this._compressedDataRepo = this._connection.getRepository(Js5CompressedDataEntity);

        return this._connection;
    }

    async getUncompressedData(where: Js5IndexEntityWhere): Promise<Js5UncompressedDataEntity> {
        return this._uncompressedDataRepo.findOne({
            where: {
                gameBuild: this.gameBuild,
                ...where
            }
        });
    }

    async getAllUncompressedData(where: Js5IndexEntityWhere): Promise<Js5UncompressedDataEntity[]> {
        return this._uncompressedDataRepo.find({
            where: {
                gameBuild: this.gameBuild,
                ...where
            }
        });
    }

    async saveUncompressedData(uncompressedDataEntity: Js5UncompressedDataEntity): Promise<Js5UncompressedDataEntity> {
        return this._uncompressedDataRepo.save(uncompressedDataEntity);
    }

    async saveAllUncompressedData(uncompressedDataEntities: Js5UncompressedDataEntity[]): Promise<void> {
        await this._uncompressedDataRepo.save(uncompressedDataEntities, {
            chunk: 500,
            transaction: false,
            reload: false,
            listeners: false,
        });
    }

    async upsertAllUncompressedData(uncompressedDataEntities: Js5UncompressedDataEntity[]): Promise<void> {
        const chunkSize = 100;
        for (let i = 0; i < uncompressedDataEntities.length; i += chunkSize) {
            const chunk = uncompressedDataEntities.slice(i, i + chunkSize);
            await this._uncompressedDataRepo.upsert(chunk, {
                conflictPaths: [ 'fileType', 'gameBuild', 'key', 'archiveKey', 'groupKey' ],
                skipUpdateIfNoValuesChanged: true,
            });
        }
    }

    async getCompressedData(where: Js5IndexEntityWhere): Promise<Js5CompressedDataEntity> {
        return this._compressedDataRepo.findOne({
            where: {
                gameBuild: this.gameBuild,
                ...where
            }
        });
    }

    async getAllCompressedData(where: Js5IndexEntityWhere): Promise<Js5CompressedDataEntity[]> {
        return this._compressedDataRepo.find({
            where: {
                gameBuild: this.gameBuild,
                ...where
            }
        });
    }

    async saveCompressedData(compressedDataEntity: Js5CompressedDataEntity): Promise<Js5CompressedDataEntity> {
        return this._compressedDataRepo.save(compressedDataEntity);
    }

    async saveAllCompressedData(compressedDataEntities: Js5CompressedDataEntity[]): Promise<void> {
        await this._compressedDataRepo.save(compressedDataEntities, {
            chunk: 500,
            transaction: false,
            reload: false,
            listeners: false,
        });
    }

    async upsertAllCompressedData(compressedDataEntities: Js5CompressedDataEntity[]): Promise<void> {
        const chunkSize = 100;
        for (let i = 0; i < compressedDataEntities.length; i += chunkSize) {
            const chunk = compressedDataEntities.slice(i, i + chunkSize);
            await this._compressedDataRepo.upsert(chunk, {
                conflictPaths: [ 'fileType', 'gameBuild', 'key', 'archiveKey', 'groupKey' ],
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

}
