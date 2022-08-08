import { JagFileStore } from './jag-file-store';
import { archives, indexes } from './jag';
import { JagFile } from './jag-file';
import { JagFileBase } from './jag-file-base';


export class JagArchive extends JagFileBase {

    readonly files: Map<number, JagFile>;

    constructor(
        jagStore: JagFileStore,
        archiveKey: number,
    ) {
        super(jagStore, 'ARCHIVE', archiveKey, indexes.archives, -1);
        const archiveNames = Object.keys(archives);
        for (const name of archiveNames) {
            if (archives[name] === archiveKey) {
                this.index.name = name;
            }
        }
        this.files = new Map<number, JagFile>();
    }

    async upsertFileIndexes(): Promise<void> {
        const fileIndexes = Array.from(this.files.values()).map(file => file.index);
        await this.fileStore.database.upsertIndexes(fileIndexes);
    }

}
