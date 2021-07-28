import { ByteBuffer } from '@runejs/core/buffer';
import { ArchiveName } from '../file-store/archive';


export interface FileInfo {
    fileIndex: number;
    fileName?: string;
}


export default interface FileCodec {
    archive: ArchiveName;
    revision: number | string;
    decode: (file: FileInfo, fileData: ByteBuffer) => Buffer | Buffer[] | string | null;
    encode: (file: FileInfo, fileData: Buffer | Buffer[] | string) => ByteBuffer;
}
