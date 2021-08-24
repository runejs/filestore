import { ByteBuffer } from '@runejs/core/buffer';
import { ArchiveName } from '../../file-store/archive';
import spriteCodec from '../sprites/sprite.codec';
import { FileTranscoder, TranscoderOptions } from '../file-transcoder';
import { FileInfo } from '../../file-store/file';


export * from '../maps/map.codec';
export * from '../sprites/sprite.codec';


/**
 * A map of special file transcoders used to encode and decode to and from JS5 files.
 */
export const fileTranscoders: { [key in ArchiveName]?: FileTranscoder } = {
    // maps: mapCodec,
    sprites: spriteCodec
};


/**
 * Decodes a JS5 file using the file transcoders from the `fileCodecs` map.
 * If the archive has no special transcoder, a standard Node `Buffer` object is returned.
 * @param archiveName The name of the JS5 archive that the file belongs to.
 * @param file A basic object containing the file's name and archive index.
 * @param fileData The `ByteBuffer` instance containing the raw file data to decode.
 * @param options [optional] Any additional options to pass through to the file transcoders (if applicable).
 */
export function decode(archiveName: ArchiveName,
                       file: FileInfo,
                       fileData: ByteBuffer,
                       options?: TranscoderOptions): Buffer | Buffer[] | string {
    if(fileTranscoders[archiveName]) {
        return fileTranscoders[archiveName].decode(file, fileData, options);
    } else {
        return Buffer.from(fileData);
    }
}


/**
 * Encodes a file into it's equivalent JS5 format using the file transcoders from the `fileCodecs` map.
 * If the archive has no special transcoder, the input data is converted from Node `Buffer` instances
 * into `ByteBuffer` instances for general use.
 * @param archiveName The name of the JS5 archive that the file belongs to.
 * @param file A basic object containing the file's name and archive index.
 * @param fileData The raw file data to transcode into JS5 format (if needed). Accepts an array of `Buffer`
 * instances for file groups, single `Buffer` instances for single files, or a `string` consisting of
 * stringified `JSON` data for the file.
 * @param options [optional] Any additional options to pass through to the file transcoders (if applicable).
 */
export function encode(archiveName: ArchiveName,
                       file: FileInfo,
                       fileData: Buffer | Buffer[] | string,
                       options?: TranscoderOptions): ByteBuffer | ByteBuffer[] | null {
    if(fileTranscoders[archiveName]) {
        return fileTranscoders[archiveName].encode(file, fileData, options);
    } else if(typeof fileData !== 'string') {
        if(fileData?.length && fileData[0] !== undefined) {
            if(typeof fileData[0] !== 'number') {
                return (fileData as Buffer[]).map(ByteBuffer.fromNodeBuffer) as ByteBuffer[];
            } else {
                return new ByteBuffer(fileData as Buffer);
            }
        } else {
            return null;
        }
    } else {
        return null;
    }
}
