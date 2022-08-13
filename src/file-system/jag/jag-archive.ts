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

    async loadFileIndexes(): Promise<void> {
        const fileIndexes = await this.fileStore.database.getIndexes({
            fileType: 'FILE',
            indexKey: this.index.indexKey,
            archiveKey: this.index.key,
        });

        if (!fileIndexes?.length) {
            return;
        }

        for (const fileIndex of fileIndexes) {
            const fileKey = fileIndex.key;

            if (!this.files.has(fileKey)) {
                const file = new JagFile(this.fileStore, fileKey, this.index.indexKey, this.index.key);
                file.index = fileIndex;
                this.files.set(fileKey, file);
            }
        }
    }

    getFile(fileKey: number): JagFile | null;
    getFile(fileName: string): JagFile | null;
    getFile(fileKeyOrName: number | string): JagFile | null;
    getFile(fileKeyOrName: number | string): JagFile | null {
        if (typeof fileKeyOrName === 'string') {
            return Array.from(this.files.values()).find(
                file => file?.index?.name === fileKeyOrName
            ) || null;
        } else {
            return this.files.get(fileKeyOrName) || null;
        }
    }

    setFile(fileKey: number, file: JagFile): void {
        this.files.set(fileKey, file);
    }

}
