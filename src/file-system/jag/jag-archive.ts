import { JagStore } from './jag-store';
import { IndexedFileBase } from '../indexed-file-base';
import { ArchiveConfig } from '../../config';


export class JagArchive extends IndexedFileBase<JagStore> {

    readonly config: ArchiveConfig;

    constructor(
        jagStore: JagStore,
        archiveKey: number,
    ) {
        super(jagStore, 'ARCHIVE', archiveKey, -1, -1);
        this.config = jagStore.getArchiveConfig(archiveKey);
        this.index.name = jagStore.getArchiveName(archiveKey);
    }

}
