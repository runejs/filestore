import { ByteBuffer } from '@runejs/core/buffer';
import { ArchiveName } from '../file-store/archive';


export default interface FileCodec {
    archive: ArchiveName;
    revision: number | string;
    decode: (buffer: ByteBuffer) => Buffer | Buffer[] | string | null;
    encode: (fileData: Buffer | Buffer[] | string) => ByteBuffer;
}
