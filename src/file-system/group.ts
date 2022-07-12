import { FileBase } from './file-base';
import { FileStore } from './file-store';
import { Archive } from './archive';
import { FlatFile } from './flat-file';


export class Group extends FileBase {

    readonly archive: Archive;
    readonly files: Map<string, FlatFile>;

    constructor(
        fileStore: FileStore,
        key: number,
        archive: Archive,
    ) {
        super(fileStore, key, archive.index.key, 'GROUP');
        this.archive = archive;
        this.files = new Map<string, FlatFile>();
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
        return this.files.get(String(fileIndex)) || null;
    }

    setFile(fileIndex: number, file: FlatFile): void {
        this.files.set(String(fileIndex), file);
    }

    findFile(fileName: string): FlatFile | null {
        return Array.from(this.files.values()).find(
            file => file?.index?.name === fileName
        ) || null;
    }

}
