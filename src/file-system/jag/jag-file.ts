import { IndexedFileBase } from '../indexed-file-base';
import { JagStore } from './jag-store';


export class JagFile extends IndexedFileBase<JagStore> {

    constructor(jagStore: JagStore, fileKey: number, indexKey: number, archiveKey: number = -1) {
        super(jagStore, 'FILE', fileKey, archiveKey, -1, indexKey);
    }

}
