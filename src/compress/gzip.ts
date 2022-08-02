import { Buffer } from 'buffer';
import { gunzipSync, gzipSync } from 'zlib';
import { ByteBuffer } from '@runejs/common';


export const compressGzip = (data: Buffer | ByteBuffer): Buffer => {
    return Buffer.from(gzipSync(data));
};

export const decompressGzip = (data: Buffer | ByteBuffer): Buffer => {
    return Buffer.from(gunzipSync(data));
};
