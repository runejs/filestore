import { ByteBuffer } from '@runejs/core/buffer';
import { ArchiveName } from '../../file-store/archive';
import mapCodec from './map.codec';
import spriteCodec from './sprite.codec';
import FileCodec from '../file-codec';

export * from './map.codec';
export * from './sprite.codec';

export const fileCodecs: { [key in ArchiveName]?: FileCodec } = {
    // maps: mapCodec,
    sprites: spriteCodec
};

export function decode(archiveName: ArchiveName, buffer: ByteBuffer): Buffer | string {
    if(fileCodecs[archiveName]) {
        return fileCodecs[archiveName].decode(buffer);
    } else {
        return Buffer.from(buffer);
    }
}

export function encode(archiveName: ArchiveName, jsonData: string): ByteBuffer | null;
export function encode(archiveName: ArchiveName, buffer: Buffer): ByteBuffer;
export function encode(archiveName: ArchiveName, buffer: Buffer | string): ByteBuffer | null {
    if(fileCodecs[archiveName]) {
        return fileCodecs[archiveName].encode(buffer);
    } else if(typeof buffer !== 'string') {
        return new ByteBuffer(buffer);
    } else {
        return null;
    }
}
