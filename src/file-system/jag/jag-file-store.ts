import { FileStoreBase } from '../file-store-base';
import { Jag, indexes } from './jag';
import { JagIndex } from './jag-index';
import { JagIndexEntity } from '../../db/jag/jag-index-entity';
import { IndexDatabase } from '../../db/index-database';
import { join } from 'path';
import { JagDatabase } from '../../db/jag/jag-database';


export class JagFileStore extends FileStoreBase<JagDatabase> {

    readonly jag: Jag;
    readonly indexes: Map<number, JagIndex>;

    constructor(gameBuild: string | number, storePath: string = './') {
        super(gameBuild, storePath);
        this.jag = new Jag(this);
        this.indexes = new Map<number, JagIndex>();
    }

    override async openDatabase(): Promise<IndexDatabase<JagIndexEntity>> {
        this._database = new JagDatabase(
            this.gameBuild,
            join(this.fileStorePath, 'index'),
            [ 'error', 'warn' ],
        );
        await this._database.openConnection();
        return this._database;
    }

    async loadIndexEntities(): Promise<void> {
        for (const [ , index ] of this.indexes) {
            await index.loadIndex();
        }
    }

    override async load(): Promise<void> {
        await this.openDatabase();
    }

    createIndex(indexKey: number): void {
        this.setIndex(indexKey, new JagIndex(this, indexKey));
    }

    getIndex(indexKey: number): JagIndex | null;
    getIndex(indexName: string): JagIndex | null;
    getIndex(indexKeyOrName: number | string): JagIndex | null;
    getIndex(indexKeyOrName: number | string): JagIndex | null {
        if (typeof indexKeyOrName === 'string') {
            return Array.from(this.indexes.values()).find(
                i => i?.index?.name === indexKeyOrName
            ) || null;
        } else {
            return this.indexes.get(indexKeyOrName) || null;
        }
    }

    setIndex(indexKey: number, index: JagIndex): void;
    setIndex(indexName: string, index: JagIndex): void;
    setIndex(indexKeyOrName: number | string, index: JagIndex): void;
    setIndex(indexKeyOrName: number | string, index: JagIndex): void {
        if (typeof indexKeyOrName === 'string') {
            this.indexes.set(indexes[indexKeyOrName], index);
        } else {
            this.indexes.set(indexKeyOrName, index);
        }
    }

}
