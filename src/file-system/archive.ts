import { FileBase } from './file-base';
import { FileStore } from './file-store';
import { Group } from './group';
import { CompressionMethod } from '@runejs/common/compress';


export class Archive extends FileBase {

    readonly groups: Map<string, Group>;

    constructor(
        fileStore: FileStore,
        key: number,
        name: string,
        indexFileCompressionMethod: CompressionMethod = 'none',
    ) {
        super(fileStore, key, 255, 'ARCHIVE');
        this.index.name = name;
        this.index.compressionMethod = indexFileCompressionMethod;
        this.groups = new Map<string, Group>();
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

    getGroup(groupIndex: number): Group | null {
        return this.groups.get(String(groupIndex)) || null;
    }

    setGroup(groupIndex: number, group: Group): void {
        this.groups.set(String(groupIndex), group);
    }

    findGroup(groupName: string): Group | null {
        return Array.from(this.groups.values()).find(
            group => group?.index?.name === groupName
        ) || null;
    }

}
