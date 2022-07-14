import { FileBase } from './file-base';
import { FileStore } from './file-store';
import { Archive } from './archive';
import { FlatFile } from './flat-file';


export class Group extends FileBase {

    readonly archive: Archive;
    readonly files: Map<number, FlatFile>;

    constructor(
        fileStore: FileStore,
        key: number,
        archive: Archive,
    ) {
        super(fileStore, key, archive.index.key, -1, 'GROUP');
        this.archive = archive;
        this.files = new Map<number, FlatFile>();
    }

    async upsertFileIndexes(): Promise<void> {
        const fileIndexes = Array.from(this.files.values()).map(file => file.index);
        await this.fileStore.database.upsertIndexes(fileIndexes);
    }

    async loadFileIndexes(): Promise<void> {
        const fileIndexes = await this.fileStore.database.getIndexes(
            'FILE', this.archive.index.key, this.index.key
        );

        if (!fileIndexes?.length) {
            return;
        }

        for (const fileIndex of fileIndexes) {
            const fileKey = fileIndex.key;

            if (!this.files.has(fileKey)) {
                const file = new FlatFile(this.fileStore, fileKey, this);
                file.index = fileIndex;
                this.files.set(fileKey, file);
            }
        }
    }

    js5Unpack(): Buffer | null {
        return this.fileStore.js5.unpack(this);
    }

    js5Decompress(): Buffer | null {
        return this.fileStore.js5.decompress(this);
    }

    async js5Decode(): Promise<void> {
        await this.fileStore.js5.decodeGroup(this);
    }

    js5Pack(): Buffer | null {
        return this.fileStore.js5.pack(this);
    }

    js5Compress(): Buffer | null {
        return this.fileStore.js5.compress(this);
    }

    js5Encode(): Buffer | null {
        return this.fileStore.js5.encodeGroup(this);
    }

    getFile(fileIndex: number): FlatFile | null {
        return this.files.get(fileIndex) || null;
    }

    setFile(fileIndex: number, file: FlatFile): void {
        this.files.set(fileIndex, file);
    }

    findFile(fileName: string): FlatFile | null {
        return Array.from(this.files.values()).find(
            file => file?.index?.name === fileName
        ) || null;
    }

}
