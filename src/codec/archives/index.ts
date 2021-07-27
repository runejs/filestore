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

export function decode(archiveName: ArchiveName, buffer: ByteBuffer): Buffer | Buffer[] | string {
    if(fileCodecs[archiveName]) {
        return fileCodecs[archiveName].decode(buffer);
    } else {
        return Buffer.from(buffer);
    }
}

export function encode(archiveName: ArchiveName, jsonData: string): ByteBuffer | ByteBuffer[] | null;
export function encode(archiveName: ArchiveName, buffer: Buffer | Buffer[]): ByteBuffer | ByteBuffer[];
export function encode(archiveName: ArchiveName, buffer: Buffer | Buffer[] | string): ByteBuffer | ByteBuffer[] | null {
    if(fileCodecs[archiveName]) {
        return fileCodecs[archiveName].encode(buffer);
    } else if(typeof buffer !== 'string') {
        if(buffer?.length && buffer[0] !== undefined) {
            if(typeof buffer[0] !== 'number') {
                return (buffer as Buffer[]).map(ByteBuffer.fromNodeBuffer) as ByteBuffer[];
            } else {
                return new ByteBuffer(buffer as Buffer);
            }
        } else {
            return null;
        }
    } else {
        return null;
    }
}
