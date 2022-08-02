import { JagStore } from './jag-store';
import { IndexedFileBase } from '../indexed-file-base';
import { ArchiveConfig } from '../../config';
import { indexes } from './jag';
import { JagFile } from './jag-file';


export class JagArchive extends IndexedFileBase<JagStore> {

    readonly config: ArchiveConfig;
    readonly files: Map<number, JagFile>;

    constructor(
        jagStore: JagStore,
        archiveKey: number,
    ) {
        super(jagStore, 'ARCHIVE', archiveKey, -1, -1, indexes.archives);
        this.config = jagStore.getArchiveConfig(archiveKey);
        this.index.name = jagStore.getArchiveName(archiveKey);
        this.files = new Map<number, JagFile>();
    }

    async upsertFileIndexes(): Promise<void> {
        const fileIndexes = Array.from(this.files.values()).map(file => file.index);
        await this.fileStore.database.upsertIndexes(fileIndexes);
    }

}
