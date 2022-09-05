import { IndexDatabase } from '../index-database';
import { JagIndexEntity } from './jag-index-entity';
import { Connection, createConnection, LoggerOptions, Repository } from 'typeorm';
import { JagFileType } from '../../config';
import { JagGameInterfaceEntity } from './content/jag-game-interface-entity';
import { existsSync, mkdirSync } from 'graceful-fs';
import { join } from 'path';
import { JagDataEntity } from './jag-data-entity';


export interface JagIndexEntityWhere {
    fileType?: JagFileType;
    key?: number;
    name?: string;
    cacheKey?: number;
    archiveKey?: number;
}


export class JagDatabase extends IndexDatabase<JagIndexEntity, JagIndexEntityWhere> {

    private _interfaceRepo: Repository<JagGameInterfaceEntity>;
    private _dataRepo: Repository<JagDataEntity>;

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
            entities: [
                JagIndexEntity,
                JagDataEntity,
                JagGameInterfaceEntity
            ],
            synchronize: true,
            logging: this.loggerOptions,
            name: 'jag-repository'
        });

        this._repository = this._connection.getRepository(JagIndexEntity);
        this._interfaceRepo = this._connection.getRepository(JagGameInterfaceEntity);
        this._dataRepo = this._connection.getRepository(JagDataEntity);

        return this._connection;
    }

    async getUncompressedData(where: JagIndexEntityWhere): Promise<JagDataEntity> {
        return this._dataRepo.findOne({
            where: {
                gameBuild: this.gameBuild,
                compressed: false,
                ...where
            }
        });
    }

    async getAllUncompressedData(where: JagIndexEntityWhere): Promise<JagDataEntity[]> {
        return this._dataRepo.find({
            where: {
                gameBuild: this.gameBuild,
                compressed: false,
                ...where
            }
        });
    }

    async saveUncompressedData(uncompressedDataEntity: JagDataEntity): Promise<JagDataEntity> {
        return this._dataRepo.save({ ...uncompressedDataEntity, compressed: false });
    }

    async saveAllUncompressedData(uncompressedDataEntities: JagDataEntity[]): Promise<void> {
        await this._dataRepo.save({ ...uncompressedDataEntities, compressed: false }, {
            chunk: 500,
            transaction: false,
            reload: false,
            listeners: false,
        });
    }

    async upsertAllUncompressedData(uncompressedDataEntities: JagDataEntity[]): Promise<void> {
        const chunkSize = 100;
        for (let i = 0; i < uncompressedDataEntities.length; i += chunkSize) {
            const chunk = uncompressedDataEntities.slice(i, i + chunkSize).map(d => ({ ...d, compressed: false }));
            await this._dataRepo.upsert(chunk, {
                conflictPaths: [ 'fileType', 'gameBuild', 'key', 'cacheKey', 'archiveKey', 'compressed' ],
                skipUpdateIfNoValuesChanged: true,
            });
        }
    }

    async getCompressedData(where: JagIndexEntityWhere): Promise<JagDataEntity> {
        return this._dataRepo.findOne({
            where: {
                gameBuild: this.gameBuild,
                compressed: true,
                ...where
            }
        });
    }

    async getAllCompressedData(where: JagIndexEntityWhere): Promise<JagDataEntity[]> {
        return this._dataRepo.find({
            where: {
                gameBuild: this.gameBuild,
                compressed: true,
                ...where
            }
        });
    }

    async saveCompressedData(compressedDataEntity: JagDataEntity): Promise<JagDataEntity> {
        return this._dataRepo.save({ ...compressedDataEntity, compressed: true });
    }

    async saveAllCompressedData(compressedDataEntities: JagDataEntity[]): Promise<void> {
        await this._dataRepo.save({ ...compressedDataEntities, compressed: true }, {
            chunk: 500,
            transaction: false,
            reload: false,
            listeners: false,
        });
    }

    async upsertAllCompressedData(compressedDataEntities: JagDataEntity[]): Promise<void> {
        const chunkSize = 100;
        for (let i = 0; i < compressedDataEntities.length; i += chunkSize) {
            const chunk = compressedDataEntities.slice(i, i + chunkSize).map(d => ({ ...d, compressed: true }));
            await this._dataRepo.upsert(chunk, {
                conflictPaths: [ 'fileType', 'gameBuild', 'key', 'cacheKey', 'archiveKey', 'compressed' ],
                skipUpdateIfNoValuesChanged: true,
            });
        }
    }

    override async upsertIndexes(indexEntities: JagIndexEntity[]): Promise<void> {
        const chunkSize = 100;
        for (let i = 0; i < indexEntities.length; i += chunkSize) {
            const chunk = indexEntities.slice(i, i + chunkSize);
            await this.repository.upsert(chunk, {
                conflictPaths: [ 'fileType', 'gameBuild', 'key', 'cacheKey', 'archiveKey' ],
                skipUpdateIfNoValuesChanged: true,
            });
        }
    }

    async saveInterfaces(entities: JagGameInterfaceEntity[]): Promise<void> {
        await this.interfaceRepo.save(entities, {
            reload: false,
            listeners: false,
            transaction: false,
            chunk: 100,
        });
    }

    async saveInterface(entity: JagGameInterfaceEntity): Promise<JagGameInterfaceEntity> {
        return await this.interfaceRepo.save(entity);
    }

    async getInterface(id: number): Promise<JagGameInterfaceEntity> {
        return await this.interfaceRepo.findOne({
            where: { id }
        });
    }

    get interfaceRepo(): Repository<JagGameInterfaceEntity> {
        return this._interfaceRepo;
    }

    get dataRepo(): Repository<JagDataEntity> {
        return this._dataRepo;
    }

}
