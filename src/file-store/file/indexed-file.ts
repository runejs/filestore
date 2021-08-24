import { logger } from '@runejs/core';
import { ByteBuffer } from '@runejs/core/buffer';
import * as CRC32 from 'crc-32';
import { createHash } from 'crypto';
import { IndexManifest } from '../index-manifest';
import { compressFile } from '../../compression';
import { IndexedArchive, compressionKey } from '../archive';


export class FileInfo {
    fileIndex: number;
    fileName?: string;
}


export interface FileCompressionOptions {
    cached?: boolean;
}


export abstract class IndexedFile extends FileInfo {

    public fileData: ByteBuffer | undefined;

    protected _fileDataCompressed: boolean = false;

    public constructor(public readonly archive: IndexedArchive,
                       fileIndex: number,
                       fileData?: ByteBuffer | undefined) {
        super();
        this.fileIndex = fileIndex;
        this.fileData = fileData;
        this.fileName = this.indexManifest?.files[this.fileIndex]?.name
            ?.replace(this.archive.config.fileExtension, '') ?? undefined;
    }

    public abstract packFileData(): ByteBuffer | undefined | Promise<ByteBuffer | undefined>;

    public async loadUncompressedFile(): Promise<ByteBuffer> {
        this.fileData = await this.packFileData();
        this._fileDataCompressed = false;
        return this.fileData;
    }

    public async compress(options?: FileCompressionOptions): Promise<ByteBuffer> {
        if(this.fileDataCompressed && this.fileData?.length && options?.cached) {
            return this.fileData;
        }

        const uncompressedFile = await this.loadUncompressedFile();

        if(!uncompressedFile?.length) {
            return null;
        }

        try {
            this.fileData = compressFile({
                buffer: uncompressedFile,
                compression: this.fileCompression,
                version: this.fileVersion
            });
            this._fileDataCompressed = true;
            return this.fileData;
        } catch(error) {
            logger.error(`Error compressing file ${this.fileIndex} within index ${this.indexManifest.index}:`);
            logger.error(error);
            this._fileDataCompressed = false;
            return null;
        }
    }

    public async generateCrc32(): Promise<number | undefined> {
        const fileData = await this.compress({ cached: true });
        if(!fileData?.length) {
            return undefined;
        }

        return CRC32.buf(this.fileVersion !== undefined ?
            fileData.slice(0, fileData.length - 2) : fileData);
    }

    public async generateShaHash(): Promise<string | undefined> {
        const hash = createHash('sha256');
        const fileData = await this.compress({ cached: true });
        if(!fileData?.length) {
            return undefined;
        }

        return hash.update(this.fileVersion !== undefined ?
            fileData.slice(0, fileData.length - 2) : fileData).digest('hex');
    }

    public async getCompressedFileLength(): Promise<number | undefined> {
        const fileData = await this.compress({ cached: true });
        if(!fileData?.length) {
            return undefined;
        }

        return fileData?.length ?? undefined;
    }

    public static async generateCrc32(fileData: ByteBuffer): Promise<number | undefined> {
        if(!fileData?.length) {
            return undefined;
        }

        return CRC32.buf(fileData);
    }

    public static async generateShaHash(fileData: ByteBuffer): Promise<string | undefined> {
        if(!fileData?.length) {
            return undefined;
        }

        const hash = createHash('sha256');
        return hash.update(fileData).digest('hex');
    }

    public get indexManifest(): IndexManifest {
        return this.archive.manifest;
    }

    public get fullFileName(): string {
        return this.indexManifest?.files[this.fileIndex]?.name ?? '';
    }

    public get fileVersion(): number | undefined {
        return this.indexManifest?.files[this.fileIndex]?.version ?? undefined;
    }

    public get fileCompression(): number {
        return compressionKey[this.archive.config.compression];
    }

    public get fileDataCompressed(): boolean {
        return this._fileDataCompressed;
    }

}
