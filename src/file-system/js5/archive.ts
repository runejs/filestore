import { JS5FileStore } from './js5-file-store';
import { Group } from './group';
import { logger } from '@runejs/common';
import { IndexedFileBase } from '../indexed-file-base';


export class Archive extends IndexedFileBase<JS5FileStore> {

    readonly groups: Map<number, Group>;

    constructor(
        fileStore: JS5FileStore,
        archiveKey: number,
        archiveName: string,
    ) {
        super(fileStore, 'ARCHIVE', archiveKey, 255, -1);
        this.index.name = archiveName;
        this.groups = new Map<number, Group>();
    }

    override validate(trackChanges: boolean = true): void {
        super.validate(trackChanges);

        let archiveModified: boolean = false;

        const { childCount } = this.index;
        const newChildCount = this.groups.size;

        if (childCount !== newChildCount) {
            this.index.childCount = newChildCount;
            archiveModified = true;
        }

        if (archiveModified && trackChanges) {
            logger.info(`Archive ${this.index.name || this.index.key} child count has changed.`);
            this.index.version++;
        }
    }

    async upsertGroupIndexes(): Promise<void> {
        const groupIndexes = Array.from(this.groups.values()).map(group => group.index);
        await this.fileStore.database.upsertIndexes(groupIndexes);
    }

    async loadGroupIndexes(): Promise<void> {
        const groupIndexes = await this.fileStore.database.getIndexes('GROUP', this.index.key);

        if (!groupIndexes?.length) {
            return;
        }

        for (const groupIndex of groupIndexes) {
            const groupKey = groupIndex.key;

            if (!this.groups.has(groupKey)) {
                const group = new Group(this.fileStore, groupKey, this);
                group.index = groupIndex;
                this.groups.set(groupKey, group);
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
        return this.groups.get(groupIndex) || null;
    }

    setGroup(groupIndex: number, group: Group): void {
        this.groups.set(groupIndex, group);
    }

    findGroup(groupName: string): Group | null {
        return Array.from(this.groups.values()).find(
            group => group?.index?.name === groupName
        ) || null;
    }

}
