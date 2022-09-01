import { Js5FileStore } from './js5-file-store';
import { Js5Group } from './js5-group';
import { logger } from '@runejs/common';
import { Js5FileBase } from './js5-file-base';
import { Js5ArchiveConfig } from '../../config';
import { Js5IndexEntity } from '../../db/js5';


export class Js5Archive extends Js5FileBase {

    readonly groups: Map<number, Js5Group>;
    readonly config: Js5ArchiveConfig;

    constructor(
        fileStore: Js5FileStore,
        archiveKey: number,
    ) {
        super(fileStore, 'ARCHIVE', archiveKey, 255, -1);
        this.config = fileStore.getArchiveConfig(archiveKey);
        this.index.name = fileStore.getArchiveName(archiveKey);
        this.groups = new Map<number, Js5Group>();
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
                const group = new Js5Group(this.fileStore, groupKey, this);
                group.index = groupIndex;
                this.groups.set(groupKey, group);
            }
        }
    }

    async upsertGroupData(): Promise<void> {
        const groups = Array.from(this.groups.values());
        const uncompressed = groups.map(group => group.data).filter(data => data?.buffer && data?.buffer?.length !== 0);
        const compressed = groups.map(group => group.compressedData).filter(data => data?.buffer && data?.buffer?.length !== 0);
        if (uncompressed.length) {
            await this.fileStore.database.upsertAllUncompressedData(uncompressed);
        }
        if (compressed.length) {
            await this.fileStore.database.upsertAllCompressedData(compressed);
        }
    }

    async getGroup(groupKey: number): Promise<Js5Group | null>;
    async getGroup(groupName: string): Promise<Js5Group | null>;
    async getGroup(groupIdentifier: number | string): Promise<Js5Group | null>;
    async getGroup(groupIdentifier: number | string): Promise<Js5Group | null> {
        let group: Js5Group;

        if (typeof groupIdentifier === 'string') {
            group = Array.from(this.groups.values()).find(
                group => group?.index?.name === groupIdentifier
            ) || null;
        } else {
            group = this.groups.get(groupIdentifier) || null;
        }

        if (!group?.index) {
            let groupEntity: Js5IndexEntity;

            if (typeof groupIdentifier === 'number' || /^\d*$/.test(groupIdentifier)) {
                const groupKey = typeof groupIdentifier === 'string' ? parseInt(groupIdentifier, 10) : groupIdentifier;
                groupEntity = await this.fileStore.database.getIndex({
                    fileType: 'GROUP',
                    archiveKey: this.index.key,
                    key: groupKey
                });
            } else {
                groupEntity = await this.fileStore.database.getIndex({
                    fileType: 'GROUP',
                    archiveKey: this.index.key,
                    name: String(groupIdentifier)
                });
            }

            if (!group) {
                group = new Js5Group(this.fileStore, groupEntity.key, this);
                group.index = groupEntity;
                this.groups.set(groupEntity.key, group);
            } else {
                group.index = groupEntity;
            }
        }

        return group;
    }

    setGroup(groupKey: number, group: Js5Group): void {
        this.groups.set(groupKey, group);
    }

}
