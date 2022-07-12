import { FileBase } from './file-base';
import { FileStore } from './file-store';
import { Archive } from './archive';
import { FlatFile } from './flat-file';


export class Group extends FileBase {

    readonly archive: Archive;
    readonly children: Map<string, FlatFile>;

    constructor(
        fileStore: FileStore,
        key: number,
        archive: Archive,
    ) {
        super(fileStore, key, archive.index.key, 'GROUP');
        this.archive = archive;
        this.children = new Map<string, FlatFile>();
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

    getChild(fileIndex: number): FlatFile {
        return this.children.get(String(fileIndex)) || null;
    }

    setChild(fileIndex: number, file: FlatFile): void {
        this.children.set(String(fileIndex), file);
    }

    findChild(fileName: string): FlatFile {
        return Array.from(this.children.values()).find(
            file => file?.index?.name === fileName
        ) || null;
    }

}
