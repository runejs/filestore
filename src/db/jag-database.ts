import { IndexDatabase } from './index-database';
import { JagIndexEntity } from './jag-index-entity';
import { LoggerOptions } from 'typeorm';
import { JagFileType } from '../config';


export interface JagIndexEntityWhere {
    fileType?: JagFileType;
    key?: number;
    indexKey?: number;
    archiveKey?: number;
}


export class JagDatabase extends IndexDatabase<JagIndexEntity, JagIndexEntityWhere> {

    constructor(
        gameBuild: string,
        databasePath: string,
        loggerOptions: LoggerOptions = 'all'
    ) {
        super(gameBuild, databasePath, JagIndexEntity, loggerOptions);
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

}
