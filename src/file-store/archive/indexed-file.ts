import { ByteBuffer } from '@runejs/core/buffer';
import { getCompressionKey, IndexManifest } from '../index-manifest';
import { compressVersionedFile } from '../../compression';


export class IndexedFile {

    public constructor(public readonly indexManifest: IndexManifest,
                       public fileId: number,
                       public fileData?: ByteBuffer | undefined) {
    }

    public async pack(): Promise<ByteBuffer> {
        if(!this.fileData) {
            throw new Error(`File ${this.fileId} within archive ${this.indexManifest.indexId} is empty.`);
        }

        return this.fileData;
    }

    public async compress(): Promise<ByteBuffer> {
        const buffer = await this.pack();

        return compressVersionedFile({
            buffer,
            compression: this.fileCompression,
            version: this.fileVersion
        });
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

}
