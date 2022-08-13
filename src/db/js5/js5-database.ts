import { IndexDatabase } from '../index-database';
import { Js5IndexEntity } from './js5-index-entity';
import { LoggerOptions } from 'typeorm';
import { Js5FileType } from '../../config';


export interface Js5IndexEntityWhere {
    fileType?: Js5FileType;
    key?: number;
    archiveKey?: number;
    groupKey?: number;
}


export class Js5Database extends IndexDatabase<Js5IndexEntity, Js5IndexEntityWhere> {

    constructor(
        gameBuild: string,
        databasePath: string,
        loggerOptions: LoggerOptions = 'all'
    ) {
        super(gameBuild, databasePath, Js5IndexEntity, loggerOptions);
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
