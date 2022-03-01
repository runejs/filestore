import { ByteBuffer } from '@runejs/common';
import { gunzipSync } from 'zlib';
const seekBzip = require('seek-bzip');


export function decompress(buffer: ByteBuffer, keys?: number[]): { compression: number, buffer: ByteBuffer, version: number } {
    if(!buffer || buffer.length === 0) {
        return { compression: -1, buffer: null, version: -1 };
    }

    const compression = buffer.get('BYTE', 'UNSIGNED');
    const compressedLength = buffer.get('INT');

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
        if (uncompressedLength < 0) {
            throw new Error(`Invalid uncompressed length`);
        }

        const decryptedData = new ByteBuffer(
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
}

export function decryptXtea(input: ByteBuffer, keys: number[], length: number): ByteBuffer {
    if(!keys || keys.length === 0) {
        return input;
    }

    const output = new ByteBuffer(length);
    const numBlocks = Math.floor(length / 8);

    for(let block = 0; block < numBlocks; block++) {
        let v0 = input.get('INT');
        let v1 = input.get('INT');
        let sum = 0x9E3779B9 * 32;

        for(let i = 0; i < 32; i++) {
            v1 -= ((toInt(v0 << 4) ^ toInt(v0 >>> 5)) + v0) ^ (sum + keys[(sum >>> 11) & 3]);
            v1 = toInt(v1);

            sum -= 0x9E3779B9;

            v0 -= ((toInt(v1 << 4) ^ toInt(v1 >>> 5)) + v1) ^ (sum + keys[sum & 3]);
            v0 = toInt(v0);
        }

        output.put(v0, 'INT');
        output.put(v1, 'INT');
    }

    input.copy(output, output.writerIndex, input.readerIndex);
    return output;
}

function toInt(value): number {
    return value | 0;
}

export function decompressBzip(data: ByteBuffer): ByteBuffer {
    const buffer = Buffer.alloc(data.length + 4);
    data.copy(buffer, 4);
    buffer[0] = 'B'.charCodeAt(0);
    buffer[1] = 'Z'.charCodeAt(0);
    buffer[2] = 'h'.charCodeAt(0);
    buffer[3] = '1'.charCodeAt(0);

    return new ByteBuffer(seekBzip.decode(buffer));
}
