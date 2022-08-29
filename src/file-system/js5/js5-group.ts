import { Js5FileStore } from './js5-file-store';
import { Js5Archive } from './js5-archive';
import { Js5File } from './js5-file';
import { logger } from '@runejs/common';
import { Js5FileBase } from './js5-file-base';
import { Js5IndexEntity } from '../../db/js5';


export class Js5Group extends Js5FileBase {

    readonly archive: Js5Archive;
    readonly files: Map<number, Js5File>;

    constructor(
        fileStore: Js5FileStore,
        groupKey: number,
        archive: Js5Archive,
    ) {
        super(fileStore, 'GROUP', groupKey, archive.index.key);
        this.archive = archive;
        this.files = new Map<number, Js5File>();
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
                const file = new Js5File(this.fileStore, fileKey, this);
                file.index = fileIndex;
                this.files.set(fileKey, file);
            }
        }
    }

    async upsertFileData(): Promise<void> {
        const files = Array.from(this.files.values());
        const uncompressed = files.map(group => group.uncompressedData).filter(data => data?.buffer && data?.buffer?.length !== 0);
        const compressed = files.map(group => group.compressedData).filter(data => data?.buffer && data?.buffer?.length !== 0);
        if (uncompressed.length) {
            await this.fileStore.database.upsertAllUncompressedData(uncompressed);
        }
        if (compressed.length) {
            await this.fileStore.database.upsertAllCompressedData(compressed);
        }
    }

    async getFile(fileKey: number): Promise<Js5File | null>;
    async getFile(fileName: string): Promise<Js5File | null>;
    async getFile(fileIdentifier: number | string): Promise<Js5File | null>;
    async getFile(fileIdentifier: number | string): Promise<Js5File | null> {
        let file: Js5File;

        if (typeof fileIdentifier === 'string') {
            file = Array.from(this.files.values()).find(
                file => file?.index?.name === fileIdentifier
            ) || null;
        } else {
            file = this.files.get(fileIdentifier) || null;
        }

        if (!file?.index) {
            let fileEntity: Js5IndexEntity;

            if (typeof fileIdentifier === 'number' || /^\d*$/.test(fileIdentifier)) {
                const fileKey = typeof fileIdentifier === 'string' ? parseInt(fileIdentifier, 10) : fileIdentifier;
                fileEntity = await this.fileStore.database.getIndex({
                    fileType: 'GROUP',
                    archiveKey: this.index.archiveKey,
                    groupKey: this.index.key,
                    key: fileKey
                });
            } else {
                fileEntity = await this.fileStore.database.getIndex({
                    fileType: 'GROUP',
                    archiveKey: this.index.archiveKey,
                    groupKey: this.index.key,
                    name: String(fileIdentifier)
                });
            }

            if (!file) {
                file = new Js5File(this.fileStore, fileEntity.key, this);
                file.index = fileEntity;
                this.files.set(fileEntity.key, file);
            } else {
                file.index = fileEntity;
            }
        }

        return file;
    }

    setFile(fileKey: number, file: Js5File): void {
        this.files.set(fileKey, file);
    }

}
