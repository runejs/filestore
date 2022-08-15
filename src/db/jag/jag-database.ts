import { IndexDatabase } from '../index-database';
import { JagIndexEntity } from './jag-index-entity';
import { Connection, createConnection, LoggerOptions, Repository } from 'typeorm';
import { JagFileType } from '../../config';
import { JagGameInterfaceEntity } from './content/jag-game-interface-entity';
import { existsSync, mkdirSync } from 'graceful-fs';
import { join } from 'path';


export interface JagIndexEntityWhere {
    fileType?: JagFileType;
    key?: number;
    indexKey?: number;
    archiveKey?: number;
}


export class JagDatabase extends IndexDatabase<JagIndexEntity, JagIndexEntityWhere> {

    private _interfaceRepo: Repository<JagGameInterfaceEntity>;

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
                JagGameInterfaceEntity
            ],
            synchronize: true,
            logging: this.loggerOptions,
            name: 'jag-index-repository'
        });

        this._repository = this._connection.getRepository(JagIndexEntity);
        this._interfaceRepo = this._connection.getRepository(JagGameInterfaceEntity);

        return this._connection;
    }

    override async upsertIndexes(indexEntities: JagIndexEntity[]): Promise<void> {
        const chunkSize = 100;
        for (let i = 0; i < indexEntities.length; i += chunkSize) {
            const chunk = indexEntities.slice(i, i + chunkSize);
            await this.repository.upsert(chunk, {
                conflictPaths: [ 'fileType', 'gameBuild', 'key', 'indexKey', 'archiveKey' ],
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

}
