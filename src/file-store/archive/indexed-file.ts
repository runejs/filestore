import { ByteBuffer } from '@runejs/core/buffer';
import { getCompressionKey, IndexManifest } from '../index-manifest';
import { compressVersionedFile } from '../../compression';
import { logger } from '@runejs/core';


export class IndexedFile {

    protected _compressedFileData?: ByteBuffer | undefined;

    public constructor(public readonly indexManifest: IndexManifest,
                       public fileId: number,
                       public fileData?: ByteBuffer | undefined) {
    }

    public compress(): ByteBuffer | null {
        if(!this.fileData) {
            return null;
        }

        try {
            this._compressedFileData = compressVersionedFile({
                buffer: this.fileData,
                compression: this.fileCompression,
                version: this.fileVersion
            });

            return this._compressedFileData;
        } catch(error) {
            logger.error(`Error compressing file ${this.fileId} within index ${this.indexManifest.indexId}:`);
            logger.error(error);
            return null;
        }
    }

    public get fullFileName(): string {
        return this.indexManifest?.files[this.fileId]?.file ?? '';
    }

    public get fileName(): string {
        return (this.indexManifest?.files[this.fileId]?.file ?? '')
            .replace(this.indexManifest.fileExtension, '');
    }

    public get fileVersion(): number {
        return this.indexManifest?.files[this.fileId]?.version ?? 0;
    }

    public get fileCompression(): number {
        return getCompressionKey(this.indexManifest.fileCompression);
    }

    public get compressedFileData(): ByteBuffer | undefined {
        return this._compressedFileData;
    }

}
