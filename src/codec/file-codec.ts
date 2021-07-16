import { ByteBuffer } from '@runejs/core/buffer';


export default interface FileCodec<T> {
    fileType: string;
    revision: number | string;
    decode: (buffer: ByteBuffer) => T;
    encode: (fileData: T) => ByteBuffer;
}
