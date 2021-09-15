import { StoreFileBase } from '@runejs/js5';
import { FlatFileStore } from './flat-file-store';
import { IndexBase } from './archive-index';


export abstract class IndexedFileEntry<T extends IndexBase> extends StoreFileBase {

    public readonly store: FlatFileStore;

    protected _indexData: T;
    protected _loaded: boolean;
    protected _modified: boolean;

    protected constructor(index: string | number, store: FlatFileStore, indexData?: T | undefined) {
        super(index);
        this.store = store;
        this._indexData = indexData;
        this._loaded = false;
        this._modified = false;
    }

    public abstract generateIndexData(): T;

    public abstract get path(): string;

    public abstract get outputPath(): string;

    public get indexData(): T {
        return this._indexData;
    }

    public get loaded(): boolean {
        return this._loaded;
    }

    public get modified(): boolean {
        return this._modified;
    }

    public get nameOrIndex(): string {
        return this.name ?? String(this.nameHash ?? this.index);
    }
}
