import { JagStore } from './jag-store';
import { IndexedFileBase } from '../indexed-file-base';


export class JagArchive extends IndexedFileBase<JagStore> {

    constructor(jagStore: JagStore, archiveKey: number, archiveName: string) {
        super(jagStore, 'ARCHIVE', archiveKey, -1, -1);
        this.index.name = archiveName;
    }

}
