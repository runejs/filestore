import { Buffer } from 'buffer';
import * as compressjs from 'compressjs';
import { ByteBuffer } from '@runejs/common';
const bzip2 = compressjs.Bzip2;


export const compressHeadlessBzip2 = (data: Buffer | ByteBuffer): Buffer => {
    const compressedData = bzip2.compressFile(data, undefined, 1);
    return Buffer.from(compressedData.slice(4, compressedData.length));
};

export const decompressHeadlessBzip2 = (data: Buffer | ByteBuffer): Buffer => {
    const buffer = Buffer.alloc(data.length + 4);
    data.copy(buffer, 4);
    buffer[0] = 'B'.charCodeAt(0);
    buffer[1] = 'Z'.charCodeAt(0);
    buffer[2] = 'h'.charCodeAt(0);
    buffer[3] = '1'.charCodeAt(0);

    return Buffer.from(bzip2.decompressFile(buffer));
};
