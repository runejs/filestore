import { ByteBuffer } from '@runejs/core/buffer';
import { ArchiveName } from '../file-store';
import { FileInfo } from '../file-store';
import { FileData, FileTranscoder, toBuffer, TranscoderOptions } from './file-transcoder';
import { Buffer } from 'buffer';

import spriteCodec from './sprites/sprite.transcoder';
import { PNG } from 'pngjs';
import { logger } from '@runejs/core';


/**
 * A map of special file transcoders used to encode and decode to and from JS5 files.
 */
export const transcoders: { [key: string]: FileTranscoder<any> } = {
    // maps: mapCodec,
    // sprites: spriteCodec
};


export default class Js5Transcoder {

    /**
     * Decodes a JS5 file using the file transcoders from the `fileCodecs` map.
     * If the archive has no special transcoder, a standard Node `Buffer` object is returned.
     * @param archiveName The name of the JS5 archive that the file belongs to.
     * @param file A basic object containing the file's name and archive index.
     * @param fileData The `ByteBuffer` instance containing the raw file data to decode.
     * @param fileGroup [optional] Whether or not this is a full file group being parsed. If set to true, the
     * decoder will return an array of Buffer objects containing the data for each individual grouped file.
     * Defaults to false.
     * @param options [optional] Any additional options to pass through to the file transcoders (if applicable).
     */
    public static decode(archiveName: string,
                         file: FileInfo,
                         fileData: ByteBuffer,
                         options?: TranscoderOptions,
                         fileGroup: boolean = false): Buffer | Buffer[] | string {
        if(transcoders[archiveName]) {
            const transcodedData = transcoders[archiveName].decode(file, fileData, options).data;
            const bufferData = toBuffer(transcodedData);

            if(bufferData === null) {
                return transcodedData as string;
            }

            return bufferData;
        }

        return fileData.toNodeBuffer();
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
    public static encode(archiveName: ArchiveName,
                         file: FileInfo,
                         fileData: FileData,
                         options?: TranscoderOptions): Buffer | Buffer[] | null {
        let transcodedData: FileData = fileData;
        if(transcoders[archiveName]) {
            transcodedData = transcoders[archiveName].encode(file, fileData, options).data;
        }

        return toBuffer(transcodedData);
    }

}
