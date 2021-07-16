import { ByteBuffer } from '@runejs/core/buffer';


export interface FileCodec<T> {
    fileType: string;
    revision: number | string;
    decode: (buffer: ByteBuffer) => T;
    encode: (fileData: T) => ByteBuffer;
}
