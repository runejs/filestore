import { JagFileStore } from './jag-file-store';
import { archives, caches } from './jag';
import { JagFile } from './jag-file';
import { JagFileBase } from './jag-file-base';


export class JagArchive extends JagFileBase {

    readonly files: Map<number, JagFile>;

    constructor(
        jagStore: JagFileStore,
        archiveKey: number,
    ) {
        super(jagStore, 'ARCHIVE', archiveKey, caches.archives, -1);
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
            cacheKey: this.index.cacheKey,
            archiveKey: this.index.key,
        });

        if (!fileIndexes?.length) {
            return;
        }

        for (const fileIndex of fileIndexes) {
            const fileKey = fileIndex.key;

            if (!this.files.has(fileKey)) {
                const file = new JagFile(this.fileStore, fileKey, this.index.cacheKey, this.index.key);
                file.index = fileIndex;
                this.files.set(fileKey, file);
            }
        }
    }

    async upsertFileData(): Promise<void> {
        const files = Array.from(this.files.values());
        const uncompressed = files.map(file => file.data).filter(data => data?.buffer && data?.buffer?.length !== 0);
        const compressed = files.map(file => file.compressedData).filter(data => data?.buffer && data?.buffer?.length !== 0);
        if (uncompressed.length) {
            await this.fileStore.database.upsertAllUncompressedData(uncompressed);
        }
        if (compressed.length) {
            await this.fileStore.database.upsertAllCompressedData(compressed);
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
