import { ByteBuffer } from '@runejs/common/buffer';
import { Buffer } from 'buffer';
import { FileInfo } from './js5-transcoder';


export type FileFormat = 'js5' | 'rjs';

export type FileData = Buffer | Buffer[] | ByteBuffer | ByteBuffer[] | string | null;


export const toBuffer = (fileData: FileData): Buffer[] => {
    if(fileData !== 'string') {
        if(fileData?.length && (fileData[0] instanceof ByteBuffer || fileData[0] instanceof Buffer)) {
            if(fileData[0] instanceof ByteBuffer) {
                return (fileData as ByteBuffer[]).map(byteBuffer => byteBuffer?.toNodeBuffer() ?? null);
            } else if(fileData[0] instanceof Buffer) {
                return fileData as Buffer[];
            }
        }

        if(fileData instanceof ByteBuffer) {
            return [ fileData?.toNodeBuffer() ?? null ];
        } else if(fileData instanceof Buffer) {
            return [ fileData ?? null ];
        }
    }

    return [];
};


export interface TranscoderOptions {
    debug?: boolean;
    [key: string]: unknown;
}


export abstract class TranscodedFile {

    public readonly archive: string;
    public readonly info: FileInfo;
    public format: FileFormat | undefined;
    public data: FileData | undefined;

    protected constructor(archive: string, fileInfo: FileInfo, format?: FileFormat, data?: FileData) {
        this.archive = archive;
        this.info = fileInfo;
        this.setData(format, data);
    }

    public setData(format?: FileFormat, data?: FileData): void {
        this.format = format;
        this.data = data;
    }

}


export interface TranscodingResponse<T extends TranscodedFile = TranscodedFile> {
    file: T | null;
    successful: boolean;
}


export interface FileTranscoder<T extends TranscodedFile = TranscodedFile, O = TranscoderOptions> {

    archive: string;
    revision: number | string;
    decode: (file: FileInfo, fileData: Buffer | ByteBuffer, options?: O) => T;
    encode: (file: FileInfo, fileData: FileData, options?: O) => T;

}
