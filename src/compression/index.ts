import { ByteBuffer } from '@runejs/core/buffer';
import { gunzipSync, gzipSync } from 'zlib';
import * as compressjs from 'compressjs';
const bzip = compressjs.Bzip2;


const toInt = (value): number => {
    return value | 0;
};


const charCode = (letter: string) => letter.charCodeAt(0);


export interface DecompressedFile {
    compression: number;
    buffer: ByteBuffer;
    version: number;
}


export const compress = (file: DecompressedFile, keys?: number[]): ByteBuffer => {
    const compressedFileData = new ByteBuffer(file.buffer.length);
    compressedFileData.put(file.compression);

    // @TODO xtea

    if(file.compression === 0) {
        // uncompressed files

        // write the uncompressed file length
        compressedFileData.put(file.buffer.length, 'int');

        // write the uncompressed file data
        compressedFileData.putBytes(file.buffer);
    } else {
        // compressed Bzip2 or Gzip file

        let compressedData: ByteBuffer;

        if(file.compression === 1) {
            compressedData = compressBzip(file.buffer);
        } else if(file.compression === 2) {
            compressedData = new ByteBuffer(gzipSync(file.buffer));
        } else {
            throw new Error(`Invalid compression type`);
        }

        // write the compressed file length
        compressedFileData.put(compressedData.length, 'int');

        // write the uncompressed file length
        compressedFileData.put(file.buffer.length, 'int');

        // write the compressed file data
        compressedFileData.putBytes(compressedData);
    }

    // write the file version, if one is applied
    if(file.version ?? -1 !== -1) {
        compressedFileData.put(file.version, 'short');
    }

    return compressedFileData;
};


export const decompress = (buffer: ByteBuffer, keys?: number[]): DecompressedFile => {
    buffer.readerIndex = 0;
    if(!buffer || buffer.length === 0) {
        return { compression: -1, buffer: null, version: -1 };
    }

    const compression = buffer.get('byte', 'unsigned');
    const compressedLength = buffer.get('int');

    if(keys && keys.length === 4 && (keys[0] !== 0 || keys[1] !== 0 || keys[2] !== 0 || keys[3] !== 0)) {
        const readerIndex = buffer.readerIndex;
        let lengthOffset = readerIndex;
        if(buffer.length - (compressedLength + readerIndex + 4) >= 2) {
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
            version = buffer.get('short');
        }

        return { compression, buffer: decryptedData, version };
    } else {
        // Compressed file
        const uncompressedLength = buffer.get('int');
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
            version = buffer.get('short');
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


export const compressBzip = (rawFileData: ByteBuffer): ByteBuffer => {
    const compressedFile = new ByteBuffer(bzip.compressFile(rawFileData));
    // Do not include the BZh- header since we know at the archive level which compression level is being used.
    return new ByteBuffer(compressedFile.slice(4, compressedFile.length));
};


export const decompressBzip = (compressedFileData: ByteBuffer): ByteBuffer => {
    const buffer = Buffer.alloc(compressedFileData.length + 4);
    compressedFileData.copy(buffer, 4);
    buffer[0] = charCode('B');
    buffer[1] = charCode('Z');
    buffer[2] = charCode('h');
    buffer[3] = charCode('1');

    return new ByteBuffer(bzip.decompressFile(buffer));
};
