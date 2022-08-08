import { Js5FileStore } from './js5-file-store';
import { Js5Archive } from './js5-archive';
import { JS5File } from './js5-file';
import { logger } from '@runejs/common';
import { Js5FileBase } from './js5-file-base';


export class JS5Group extends Js5FileBase {

    readonly archive: Js5Archive;
    readonly files: Map<number, JS5File>;

    constructor(
        fileStore: Js5FileStore,
        groupKey: number,
        archive: Js5Archive,
    ) {
        super(fileStore, 'GROUP', groupKey, archive.index.key);
        this.archive = archive;
        this.files = new Map<number, JS5File>();
    }

    override validate(trackChanges: boolean = true): void {
        super.validate(trackChanges);

        let groupModified: boolean = false;

        const { childCount } = this.index;
        const newChildCount = this.files.size;

        if (childCount !== newChildCount) {
            this.index.childCount = newChildCount;
            groupModified = true;
        }

        if (groupModified && trackChanges) {
            logger.info(`Group ${this.index.name || this.index.key} child count has changed.`);
            this.index.version++;
        }
    }

    async upsertFileIndexes(): Promise<void> {
        const fileIndexes = Array.from(this.files.values()).map(file => file.index);
        await this.fileStore.database.upsertIndexes(fileIndexes);
    }

    async loadFileIndexes(): Promise<void> {
        const fileIndexes = await this.fileStore.database.getIndexes({
            fileType: 'FILE',
            archiveKey: this.archive.index.key,
            groupKey: this.index.key,
        });

        if (!fileIndexes?.length) {
            return;
        }

        for (const fileIndex of fileIndexes) {
            const fileKey = fileIndex.key;

            if (!this.files.has(fileKey)) {
                const file = new JS5File(this.fileStore, fileKey, this);
                file.index = fileIndex;
                this.files.set(fileKey, file);
            }
        }
    }

    getFile(fileKey: number): JS5File | null;
    getFile(fileName: string): JS5File | null;
    getFile(fileKeyOrName: number | string): JS5File | null;
    getFile(fileKeyOrName: number | string): JS5File | null {
        if (typeof fileKeyOrName === 'string') {
            return Array.from(this.files.values()).find(
                file => file?.index?.name === fileKeyOrName
            ) || null;
        } else {
            return this.files.get(fileKeyOrName) || null;
        }
    }

    setFile(fileKey: number, file: JS5File): void {
        this.files.set(fileKey, file);
    }

}
