import { ByteBuffer } from '@runejs/core/buffer';
import { gunzipSync } from 'zlib';
import * as compressjs from 'compressjs';
const seekBzip = require('seek-bzip');
const bzip = compressjs.Bzip2;


export interface DecompressedFile {
    compression: number;
    buffer: ByteBuffer;
    version: number;
}


// @todo stub
export const compress = (file: DecompressedFile, keys?: number[]): ByteBuffer => {
    return null;
};


export const decompress = (buffer: ByteBuffer, keys?: number[]): DecompressedFile => {
    buffer.readerIndex = 0;
    if(!buffer || buffer.length === 0) {
        return { compression: -1, buffer: null, version: -1 };
    }

    const compression = buffer.get('byte', 'unsigned');
    const compressedLength = buffer.get('int');

    if (keys && keys.length == 4 && (keys[0] != 0 || keys[1] != 0 || keys[2] != 0 || keys[3] != 0)) {
        const readerIndex = buffer.readerIndex;
        let lengthOffset = readerIndex;
        if (buffer.length - (compressedLength + readerIndex + 4) >= 2) {
            lengthOffset += 2;
        }
        const decryptedData = decryptXtea(buffer, keys, buffer.length - lengthOffset);
        decryptedData.copy(buffer, readerIndex, 0);
        buffer.readerIndex = readerIndex;
    }

    if(compression == 0) {
        // Uncompressed file
        const data = new ByteBuffer(compressedLength);
        buffer.copy(data, 0, buffer.readerIndex, compressedLength);
        const decryptedData = decryptXtea(data, keys, compressedLength);
        buffer.readerIndex = (buffer.readerIndex + compressedLength);

        let version = -1;
        if(buffer.readable >= 2) {
            version = buffer.get('SHORT');
        }

        return { compression, buffer: decryptedData, version };
    } else {
        // Compressed file
        const uncompressedLength = buffer.get('INT');
        if(uncompressedLength < 0) {
            throw new Error('MISSING_ENCRYPTION_KEYS');
        }

        let decryptedData = new ByteBuffer(
            compression == 1 ? uncompressedLength : (buffer.length - buffer.readerIndex + 2)
        );
        buffer.copy(decryptedData, 0, buffer.readerIndex);

        let decompressed: ByteBuffer;
        if(compression === 1) { // BZIP2
            decompressed = decompressBzip(decryptedData);
        } else if(compression === 2) { // GZIP
            decompressed = new ByteBuffer(gunzipSync(decryptedData));
        } else {
            throw new Error(`Invalid compression type`);
        }

        buffer.readerIndex = buffer.readerIndex + compressedLength;

        if(decompressed.length !== uncompressedLength) {
            throw new Error(`Length mismatch`);
        }

        let version = -1;
        if(buffer.readable >= 2) {
            version = buffer.get('SHORT');
        }

        return { compression, buffer: decompressed, version };
    }
};


// @todo stub
export const encryptXtea = (input: ByteBuffer, keys: number[], length: number): ByteBuffer => {
    return null;
};


export const decryptXtea = (input: ByteBuffer, keys: number[], length: number): ByteBuffer => {
    if(!keys || keys.length === 0) {
        return input;
    }

    const output = new ByteBuffer(length);
    const numBlocks = Math.floor(length / 8);

    for(let block = 0; block < numBlocks; block++) {
        let v0 = input.get('int');
        let v1 = input.get('int');
        let sum = 0x9E3779B9 * 32;

        for(let i = 0; i < 32; i++) {
            v1 -= ((toInt(v0 << 4) ^ toInt(v0 >>> 5)) + v0) ^ (sum + keys[(sum >>> 11) & 3]);
            v1 = toInt(v1);

            sum -= 0x9E3779B9;

            v0 -= ((toInt(v1 << 4) ^ toInt(v1 >>> 5)) + v1) ^ (sum + keys[sum & 3]);
            v0 = toInt(v0);
        }

        output.put(v0, 'int');
        output.put(v1, 'int');
    }

    input.copy(output, output.writerIndex, input.readerIndex);
    return output;
};


const toInt = (value): number => {
    return value | 0;
};


const charCode = (letter: string) => letter.charCodeAt(0);


// @todo stub
export const compressBzip = (rawFileData: ByteBuffer): ByteBuffer => {
    return null;
};


export const decompressBzip = (compressedFileData: ByteBuffer): ByteBuffer => {
    const buffer = Buffer.alloc(compressedFileData.length + 4);
    compressedFileData.copy(buffer, 4);
    buffer[0] = charCode('B');
    buffer[1] = charCode('Z');
    buffer[2] = charCode('h');
    buffer[3] = charCode('1'); // block count

    return new ByteBuffer(bzip.decompressFile(buffer));
};
