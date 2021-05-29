import { ByteBuffer } from '@runejs/core/buffer';


const toInt = value => value | 0;


export default class Xtea {

    public static validKeys(keys?: number[] | undefined): boolean {
        return keys?.length === 4 && (keys[0] !== 0 || keys[1] !== 0 || keys[2] !== 0 || keys[3] !== 0);
    }

    // @TODO untested
    public static encrypt(input: ByteBuffer, keys: number[], length: number): ByteBuffer {
        const encryptedBuffer = new ByteBuffer(length);
        const chunks = length / 8;
        input.readerIndex = 0;

        for(let i = 0; i < chunks; i++) {
            let v0 = input.get('int');
            let v1 = input.get('int');
            let sum = 0;
            let delta = -0x61c88647;

            let rounds = 32;
            while(rounds-- > 0) {
                v0 += ((sum + keys[sum & 3]) ^ (v1 + ((v1 >>> 5) ^ (v1 << 4))));
                sum += delta
                v1 += ((v0 + ((v0 >>> 5) ^ (v0 << 4))) ^ (keys[(sum >>> 11) & 3] + sum));
            }

            encryptedBuffer.put(v0, 'int');
            encryptedBuffer.put(v1, 'int');
        }

        return encryptedBuffer.flipWriter();
    }

    public static decrypt(input: ByteBuffer, keys: number[], length: number): ByteBuffer {
        if(!keys?.length) {
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
    }

}
