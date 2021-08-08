import { ByteBuffer } from '@runejs/core/buffer';
import { ArchiveName } from '../../file-store/archive';
import spriteCodec from '../sprites/sprite.codec';
import FileCodec, { FileInfo } from '../file-codec';

export * from '../maps/map.codec';
export * from '../sprites/sprite.codec';

export const fileCodecs: { [key in ArchiveName]?: FileCodec } = {
    // maps: mapCodec,
    sprites: spriteCodec
};

export function decode(archiveName: ArchiveName, file: FileInfo, buffer: ByteBuffer): Buffer | Buffer[] | string {
    if(fileCodecs[archiveName]) {
        return fileCodecs[archiveName].decode(file, buffer);
    } else {
        return Buffer.from(buffer);
    }
}

export function encode(archiveName: ArchiveName, file: FileInfo, jsonData: string): ByteBuffer | ByteBuffer[] | null;
export function encode(archiveName: ArchiveName, file: FileInfo, buffer: Buffer | Buffer[]): ByteBuffer | ByteBuffer[];
export function encode(archiveName: ArchiveName, file: FileInfo, buffer: Buffer | Buffer[] | string): ByteBuffer | ByteBuffer[] | null {
    if(fileCodecs[archiveName]) {
        return fileCodecs[archiveName].encode(file, buffer);
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
