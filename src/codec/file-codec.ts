import { ByteBuffer } from '@runejs/core/buffer';
import { ArchiveName } from '../file-store/archive';


export default interface FileCodec {
    archive: ArchiveName;
    revision: number | string;
    decode: (buffer: ByteBuffer) => Buffer | string | null;
    encode: (fileData: Buffer | string) => ByteBuffer;
}
