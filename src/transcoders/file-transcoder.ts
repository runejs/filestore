import { ByteBuffer } from '@runejs/core/buffer';
import { ArchiveName } from '../file-store/archive';
import { FileInfo } from '../file-store/file';



export interface TranscoderOptions {
    debug?: boolean;
    [key: string]: unknown;
}


export interface FileTranscoder<T = TranscoderOptions> {

    archive: ArchiveName;

    revision: number | string;

    decode: (file: FileInfo,
             fileData: ByteBuffer,
             options?: T) => Buffer | Buffer[] | string | null;

    encode: (file: FileInfo,
             fileData: Buffer | Buffer[] | string,
             options?: T) => ByteBuffer;

}
