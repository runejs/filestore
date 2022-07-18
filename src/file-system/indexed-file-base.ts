import { IndexEntity } from '../db/index-entity';
import { FileStoreBase } from './file-store-base';
import { FileType } from '../config';
import { logger } from '@runejs/common';
import { Buffer } from 'buffer';
import { Crc32 } from '@runejs/common/crc32';
import { createHash } from 'crypto';


export abstract class IndexedFileBase<S extends FileStoreBase<any, any>> {

    readonly fileStore: S;
    index: IndexEntity;

    protected constructor(
        fileStore: S,
        fileType: FileType,
        key: number,
        archiveKey: number = -1,
        groupKey: number = -1,
    ) {
        this.fileStore = fileStore;
        this.index = new IndexEntity();
        this.index.gameBuild = fileStore.gameBuild;
        this.index.fileType = fileType;
        this.index.key = key;
        this.index.archiveKey = archiveKey;
        this.index.groupKey = groupKey;
    }

    validate(trackChanges: boolean = true): void {
        const {
            data, compressedData,
            checksum, shaDigest, fileSize,
            compressedChecksum, compressedShaDigest, compressedFileSize,
            name, nameHash,
        } = this.index;
        let fileModified: boolean = false;

        const currentChecksum = this.generateChecksum(data);
        const currentShaDigest = this.generateShaDigest(data);
        const currentFileSize = data?.length || 0;

        const currentCompressedChecksum = this.generateChecksum(compressedData);
        const currentCompressedShaDigest = this.generateShaDigest(compressedData);
        const currentCompressedFileSize = compressedData?.length || 0;

        if (name && nameHash === -1) {
            // nameHash not set
            this.index.nameHash = this.fileStore.djb2.hashFileName(name);
        }

        if (nameHash !== -1 && !name) {
            // name not set
            const lookupTableName = this.fileStore.djb2.findFileName(nameHash);
            if (lookupTableName) {
                this.index.name = lookupTableName;
            }
        }

        if (checksum !== currentChecksum) {
            // uncompressed crc32 mismatch
            this.index.checksum = currentChecksum;
            fileModified = true;
        }

        if (shaDigest !== currentShaDigest) {
            // uncompressed sha256 mismatch
            this.index.shaDigest = currentShaDigest;
            fileModified = true;
        }

        if (fileSize !== currentFileSize) {
            // uncompressed file size mismatch
            this.index.fileSize = currentFileSize;
            fileModified = true;
        }

        if (compressedChecksum !== currentCompressedChecksum) {
            // compressed crc32 mismatch
            this.index.compressedChecksum = currentCompressedChecksum;
            fileModified = true;
        }

        if (compressedShaDigest !== currentCompressedShaDigest) {
            // compressed sha256 mismatch
            this.index.compressedShaDigest = currentCompressedShaDigest;
            fileModified = true;
        }

        if (compressedFileSize !== currentCompressedFileSize) {
            // compressed file size mismatch
            this.index.compressedFileSize = currentCompressedFileSize;
            fileModified = true;
        }

        if (fileModified && trackChanges) {
            logger.info(`File ${this.index.name || this.index.key} has been modified.`);
            this.index.version++;
        }
    }

    async saveIndex(): Promise<IndexEntity> {
        this.validate();
        this.index = await this.fileStore.database.saveIndex(this.index);
        return this.index;
    }

    async loadIndex(): Promise<IndexEntity> {
        const indexEntity = await this.fileStore.database.getIndex(
            this.index.fileType, this.index.key, this.index.archiveKey
        );

        if (indexEntity) {
            this.index = indexEntity;
        }

        return this.index;
    }

    generateChecksum(data: Buffer): number {
        if (!data?.length) {
            return -1;
        }

        return Crc32.update(0, data.length, data);
    }

    generateShaDigest(data: Buffer): string {
        if (!data?.length) {
            return null;
        }

        return createHash('sha256').update(data).digest('hex');
    }

    get stripes(): number[] {
        if (!this.index?.stripes) {
            return [];
        }

        return this.index.stripes.split(',').map(n => Number(n));
    }

}
