import { JagArchive } from './jag-archive';
import { FileStoreBase } from '../file-store-base';
import { Jag, indexes } from './jag';
import { JagIndex } from './jag-index';


export class JagStore extends FileStoreBase<JagArchive> {

    readonly jag: Jag;
    readonly indexes: Map<number, JagIndex>;

    constructor(gameBuild: string | number, storePath: string = './') {
        super(gameBuild, storePath, 'jag-cache-archives');
        this.jag = new Jag(this);
        this.indexes = new Map<number, JagIndex>();
    }

    override async load(): Promise<void> {
        await this.openDatabase();
    }

    createArchive(archiveKey: number): JagArchive {
        const archive = new JagArchive(this, archiveKey);
        this.setArchive(archiveKey, archive);
        return archive;
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
