import { ByteBuffer } from '@runejs/core/buffer';
import { gunzipSync, gzipSync } from 'zlib';


export default class Gzip {

    public static compress(buffer: ByteBuffer): ByteBuffer {
        return new ByteBuffer(gzipSync(buffer));
    }

    public static decompress(buffer: ByteBuffer): ByteBuffer {
        return new ByteBuffer(gunzipSync(buffer));
    }

}
