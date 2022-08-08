import { join } from 'path';
import { Crc32 } from '@runejs/common/crc32';

import { NameHasher } from '../config';
import { IndexDatabase } from '../db/index-database';


export abstract class FileStoreBase<DATABASE extends IndexDatabase<any,  any>> {

    readonly gameBuild: string;
    readonly fileStorePath: string;
    readonly nameHasher: NameHasher;

    protected _database: DATABASE;

    protected constructor(gameBuild: string | number, storePath: string) {
        this.gameBuild = String(gameBuild);
        this.fileStorePath = storePath;
        this.nameHasher = new NameHasher(join(storePath, 'config'));
        Crc32.init();
    }

    abstract openDatabase(): Promise<DATABASE>;

    abstract load(): void | Promise<void>;

    async closeDatabase(): Promise<void> {
        await this._database.closeConnection();
    }

    get database(): DATABASE {
        return this._database;
    }

}
