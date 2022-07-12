import { FileBase } from './file-base';
import { FileStore } from './file-store';
import { FileType } from './file-type';
import { Group } from './group';


export class Archive extends FileBase {

    readonly children: Map<string, Group>;

    constructor(
        fileStore: FileStore,
        key: number,
    ) {
        super(fileStore, key, -1, 'ARCHIVE');
        this.children = new Map<string, Group>();
    }

    js5Unpack(): Buffer | null {
        return this.fileStore.js5.unpack(this);
    }

    js5Decompress(): Buffer | null {
        return this.fileStore.js5.decompress(this);
    }

    async js5Decode(): Promise<void> {
        await this.fileStore.js5.decodeArchive(this);
    }

    js5Pack(): Buffer | null {
        return this.fileStore.js5.pack(this);
    }

    js5Compress(): Buffer | null {
        return this.fileStore.js5.compress(this);
    }

    js5Encode(): Buffer | null {
        return this.fileStore.js5.encodeArchive(this);
    }

    getChild(groupIndex: number): Group {
        return this.children.get(String(groupIndex)) || null;
    }

    setChild(groupIndex: number, group: Group): void {
        this.children.set(String(groupIndex), group);
    }

    findChild(groupName: string): Group {
        return Array.from(this.children.values()).find(
            group => group?.index?.name === groupName
        ) || null;
    }

}
