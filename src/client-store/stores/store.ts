import { ArchiveName, FileStore, IndexedArchive } from '../../file-store';
import { ClientFileStore } from '../client-file-store';
import { ClientArchive } from '../client-archive';


export abstract class Store {

    public readonly flatFileStore: FileStore;
    public readonly clientFileStore: ClientFileStore;
    public readonly archiveName: ArchiveName;

    private _clientArchive: ClientArchive;
    private _indexedArchive: IndexedArchive;

    protected constructor(flatFileStore: FileStore, archiveName: ArchiveName);
    protected constructor(clientFileStore: ClientFileStore, archiveName: ArchiveName);
    protected constructor(fileStore: ClientFileStore | FileStore, archiveName: ArchiveName);
    protected constructor(fileStore: ClientFileStore | FileStore, archiveName: ArchiveName) {
        if(fileStore instanceof FileStore) {
            this.flatFileStore = fileStore;
        } else {
            this.clientFileStore = fileStore;
        }
        this.archiveName = archiveName;
    }

    public get clientArchive(): ClientArchive {
        if(!this._clientArchive) {
            this._clientArchive = this.clientFileStore?.getArchive(this.archiveName);
        }
        return this._clientArchive;
    }

    public get indexedArchive(): IndexedArchive {
        if(!this._indexedArchive) {
            this._indexedArchive = this.flatFileStore?.getArchive(this.archiveName);
        }
        return this._indexedArchive;
    }

}
