import { ByteBuffer } from '@runejs/core/buffer';
import { IndexedFile } from './indexed-file';


export class FlatFile extends IndexedFile {

    private _uncompressedFileData: ByteBuffer | undefined;

    public packFileData(): ByteBuffer | undefined {
        if(!this.fileDataCompressed && !this._uncompressedFileData) {
            this._uncompressedFileData = new ByteBuffer(this.fileData);
        }

        return this.fileData;
    }

    public get uncompressedFileData(): ByteBuffer | undefined {
        return this._uncompressedFileData;
    }
}
