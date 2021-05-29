import { ByteBuffer } from '@runejs/core/buffer';
import * as compressjs from 'compressjs';
const bzip = compressjs.Bzip2;


const charCode = (letter: string) => letter.charCodeAt(0);


export default class Bzip2 {

    public static compress(rawFileData: ByteBuffer): ByteBuffer {
        const compressedFile = new ByteBuffer(bzip.compressFile(rawFileData, undefined, 1));
        // Do not include the BZip compression level header because the client expects a headerless BZip format
        return new ByteBuffer(compressedFile.slice(4, compressedFile.length));
    }

    public static decompress(compressedFileData: ByteBuffer): ByteBuffer {
        const buffer = Buffer.alloc(compressedFileData.length + 4);
        compressedFileData.copy(buffer, 4);
        buffer[0] = charCode('B');
        buffer[1] = charCode('Z');
        buffer[2] = charCode('h');
        buffer[3] = charCode('1');

        return new ByteBuffer(bzip.decompressFile(buffer));
    }

}
