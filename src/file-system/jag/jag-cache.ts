import { JagFileStore } from './jag-file-store';
import { JagFileIndex, caches } from './jag';
import { JagArchive } from './jag-archive';
import { JagFile } from './jag-file';
import { JagFileBase } from './jag-file-base';


export class JagCache extends JagFileBase {

    readonly files: Map<number, JagArchive | JagFile>;

    fileIndexes: JagFileIndex[];

    constructor(jagStore: JagFileStore, cacheKey: number) {
        super(jagStore, 'CACHE', cacheKey);
        const indexNames = Object.keys(caches);
        for (const name of indexNames) {
            if (caches[name] === cacheKey) {
                this.index.name = name;
            }
        }
        this.files = new Map<number, JagArchive | JagFile>();
    }

    async upsertFileIndexes(): Promise<void> {
        const fileIndexes = Array.from(this.files.values()).map(file => file.index);
        await this.fileStore.database.upsertIndexes(fileIndexes);
    }

    async loadFileIndexes(): Promise<void> {
        const fileIndexes = await this.fileStore.database.getIndexes({
            cacheKey: this.index.key,
            archiveKey: -1,
        });

        if (!fileIndexes?.length) {
            return;
        }

        for (const fileIndex of fileIndexes) {
            const fileKey = fileIndex.key;

            if (!this.files.has(fileKey)) {
                let file: JagFileBase;

                if (fileIndex.fileType === 'ARCHIVE') {
                    file = new JagArchive(this.fileStore, fileKey);
                } else {
                    file = new JagFile(this.fileStore, fileKey, this.index.key, -1);
                }

                file.index = fileIndex;
                this.files.set(fileKey, file);
            }
        }
    }

    createArchive(archiveKey: number): JagArchive {
        const archive = new JagArchive(this.fileStore, archiveKey);
        this.setArchive(archiveKey, archive);
        return archive;
    }

    getArchive(archiveKey: number): JagArchive | null;
    getArchive(archiveName: string): JagArchive | null;
    getArchive(archiveKeyOrName: number | string): JagArchive | null;
    getArchive(archiveKeyOrName: number | string): JagArchive | null {
        let archive: JagFile | JagArchive | null;

        if (typeof archiveKeyOrName === 'string') {
            archive = Array.from(this.files.values()).find(
                file => file?.index?.name === archiveKeyOrName
            ) || null;
        } else {
            archive = this.files.get(archiveKeyOrName) || null;
        }

        return (archive && archive instanceof JagArchive) ? archive : null;
    }

    setArchive(archiveKey: number, archive: JagArchive): void {
        this.files.set(archiveKey, archive);
    }

    getFile(fileKey: number): JagFile | null;
    getFile(fileName: string): JagFile | null;
    getFile(fileKeyOrName: number | string): JagFile | null;
    getFile(fileKeyOrName: number | string): JagFile | null {
        let file: JagFile | JagArchive | null;

        if (typeof fileKeyOrName === 'string') {
            file = Array.from(this.files.values()).find(
                file => file?.index?.name === fileKeyOrName
            ) || null;
        } else {
            file = this.files.get(fileKeyOrName) || null;
        }

        return (file && file instanceof JagFile) ? file : null;
    }

    setFile(fileKey: number, file: JagFile): void {
        this.files.set(fileKey, file);
    }

}
