import { ArchiveName } from '../../file-store';
import { ClientFileStore } from '../client-file-store';
import { ClientArchive } from '../client-archive';


export abstract class Store {

    public readonly fileStore: ClientFileStore;
    public readonly archiveName: ArchiveName;

    private _archive: ClientArchive;

    protected constructor(fileStore: ClientFileStore, archiveName: ArchiveName) {
        this.fileStore = fileStore;
        this.archiveName = archiveName;
    }

    public get archive(): ClientArchive {
        if(!this._archive) {
            this._archive = this.fileStore.getArchive(this.archiveName);
        }
        return this._archive;
    }

}
