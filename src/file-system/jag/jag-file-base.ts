import { JagFileType } from '../../config';
import { logger } from '@runejs/common';
import { Buffer } from 'buffer';
import { Crc32 } from '@runejs/common/crc32';
import { createHash } from 'crypto';
import { JagFileStore } from './jag-file-store';
import { JagDataEntity, JagIndexEntity } from '../../db/jag';


export abstract class JagFileBase {

    readonly fileStore: JagFileStore;

    index: JagIndexEntity;
    data: JagDataEntity;
    compressedData: JagDataEntity;

    protected constructor(
        fileStore: JagFileStore,
        fileType: JagFileType,
        key: number,
        cacheKey: number = -1,
        archiveKey: number = -1,
    ) {
        this.fileStore = fileStore;
        this.index = new JagIndexEntity();
        this.data = new JagDataEntity();
        this.compressedData = new JagDataEntity();
        this.compressedData.compressed = true;
        this.data.gameBuild = this.compressedData.gameBuild = this.index.gameBuild = fileStore.gameBuild;
        this.data.fileType = this.compressedData.fileType = this.index.fileType = fileType;
        this.data.key = this.compressedData.key = this.index.key = key;
        this.data.cacheKey = this.compressedData.cacheKey = this.index.cacheKey = cacheKey;
        this.data.archiveKey = this.compressedData.archiveKey = this.index.archiveKey = archiveKey;
    }

    validate(trackChanges: boolean = true): void {
        const data = this.data.buffer;
        const compressedData = this.compressedData.buffer;
        const {
            checksum, shaDigest, fileSize,
            compressedChecksum, compressedShaDigest, compressedFileSize,
            name, nameHash, compressionMethod,
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
            this.index.nameHash = this.fileStore.nameHasher.hashJs5FileName(name);
        }

        if (nameHash !== -1 && !name) {
            // name not set
            const lookupTableName = this.fileStore.nameHasher.findFileName(nameHash);
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

        if ((!this.index.compressionMethod || this.index.compressionMethod === 'none' || this.index.compressedFileSize === fileSize)
            && this.compressedData?.buffer?.length) {
            // File has no compression, clear the compressed data buffer so that we do not create a
            // duplicate data entity record for it
            this.compressedData.buffer = null;
            this.index.compressedFileSize = 0;
            this.index.compressedChecksum = -1;
            this.index.compressedShaDigest = null;
        }

        if (fileModified && trackChanges) {
            logger.info(`File ${this.index.name || this.index.key} has been modified.`);
            this.index.version++;
        }
    }

    async saveUncompressedData(): Promise<JagDataEntity | null> {
        if (!this.data?.buffer?.length) {
            // Do not save a record for files with missing or empty data
            return null;
        }

        this.data = await this.fileStore.database.saveUncompressedData(this.data);
        return this.data;
    }

    async loadUncompressedData(): Promise<JagDataEntity> {
        const entity = await this.fileStore.database.getUncompressedData({
            fileType: this.index.fileType,
            key: this.index.key,
            archiveKey: this.index.archiveKey,
            cacheKey: this.index.cacheKey,
        });

        if (entity) {
            this.data = entity;
        }

        return this.data;
    }

    async getUncompressedData(): Promise<Buffer | null> {
        if (this.data?.buffer?.length) {
            return this.data.buffer;
        }

        const uncompressedData = await this.loadUncompressedData();
        if (uncompressedData?.buffer?.length) {
            return uncompressedData.buffer;
        }

        return null;
    }

    async saveCompressedData(): Promise<JagDataEntity | null> {
        if (!this.compressedData?.buffer?.length) {
            // Do not save a record for files with missing or empty data
            return null;
        }

        this.compressedData = await this.fileStore.database.saveCompressedData(this.compressedData);
        return this.compressedData;
    }

    async loadCompressedData(): Promise<JagDataEntity> {
        const entity = await this.fileStore.database.getCompressedData({
            fileType: this.index.fileType,
            key: this.index.key,
            archiveKey: this.index.archiveKey,
            cacheKey: this.index.cacheKey,
        });

        if (entity) {
            this.compressedData = entity;
        }

        return this.compressedData;
    }

    async getCompressedData(): Promise<Buffer | null> {
        if (!this.index) {
            await this.loadIndex();
        }

        if (!this.index.compressionMethod || this.index.compressionMethod === 'none') {
            return this.getUncompressedData();
        }

        if (this.compressedData?.buffer?.length) {
            return this.compressedData.buffer;
        }

        const compressedData = await this.loadCompressedData();
        if (compressedData?.buffer?.length) {
            return compressedData.buffer;
        }

        return null;
    }

    async saveIndex(): Promise<JagIndexEntity> {
        this.validate();
        this.index = await this.fileStore.database.saveIndex(this.index);
        return this.index;
    }

    async loadIndex(): Promise<JagIndexEntity> {
        const indexEntity = await this.fileStore.database.getIndex({
            fileType: this.index.fileType,
            key: this.index.key,
            cacheKey: this.index.cacheKey,
            archiveKey: this.index.archiveKey,
        });

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

}
