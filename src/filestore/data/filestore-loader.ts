import { ByteBuffer } from '@runejs/common';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';


export interface FilestoreChannels {
    dataChannel: ByteBuffer;
    indexChannels: ByteBuffer[];
    metaChannel: ByteBuffer;
}

export const loadFilestore = (dir: string): FilestoreChannels => {
    const dataChannel = new ByteBuffer(readFileSync(join(dir, 'main_file_cache.dat2')));
    const indexChannels = [];

    for(let i = 0; i < 254; i++) {
        try {
            const index = new ByteBuffer(readFileSync(join(dir, `main_file_cache.idx${i}`)));
            indexChannels.push(index);
        } catch(error) {
            break;
        }
    }

    const metaChannel = new ByteBuffer(readFileSync(join(dir, 'main_file_cache.idx255')));

    return {
        dataChannel,
        indexChannels,
        metaChannel
    };
};
