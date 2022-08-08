import { Js5FileStore } from './js5-file-store';
import { JS5Group } from './js5-group';
import { logger } from '@runejs/common';
import { Js5FileBase } from './js5-file-base';
import { Js5ArchiveConfig } from '../../config';


export class Js5Archive extends Js5FileBase {

    readonly groups: Map<number, JS5Group>;
    readonly config: Js5ArchiveConfig;

    constructor(
        fileStore: Js5FileStore,
        archiveKey: number,
    ) {
        super(fileStore, 'ARCHIVE', archiveKey, 255, -1);
        this.config = fileStore.getArchiveConfig(archiveKey);
        this.index.name = fileStore.getArchiveName(archiveKey);
        this.groups = new Map<number, JS5Group>();
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
        const groupIndexes = await this.fileStore.database.getIndexes({
            fileType: 'GROUP',
            archiveKey: this.index.key,
        });

        if (!groupIndexes?.length) {
            return;
        }

        for (const groupIndex of groupIndexes) {
            const groupKey = groupIndex.key;

            if (!this.groups.has(groupKey)) {
                const group = new JS5Group(this.fileStore, groupKey, this);
                group.index = groupIndex;
                this.groups.set(groupKey, group);
            }
        }
    }

    getGroup(groupKey: number): JS5Group | null;
    getGroup(groupName: string): JS5Group | null;
    getGroup(groupKeyOrName: number | string): JS5Group | null;
    getGroup(groupKeyOrName: number | string): JS5Group | null {
        if (typeof groupKeyOrName === 'string') {
            return Array.from(this.groups.values()).find(
                group => group?.index?.name === groupKeyOrName
            ) || null;
        } else {
            return this.groups.get(groupKeyOrName) || null;
        }
    }

    setGroup(groupKey: number, group: JS5Group): void {
        this.groups.set(groupKey, group);
    }

}
