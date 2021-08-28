import { ByteBuffer } from '@runejs/core/buffer';
import { ArchiveName } from '../file-store/archive';
import { FileInfo } from '../file-store/file';
import { Buffer } from 'buffer';


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

    public readonly archive: ArchiveName;
    public readonly info: FileInfo;
    public format: FileFormat | undefined;
    public data: FileData | undefined;

    protected constructor(archive: ArchiveName, fileInfo: FileInfo, format?: FileFormat, data?: FileData) {
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

    archive: ArchiveName;
    revision: number | string;
    decode: (file: FileInfo, fileData: Buffer | ByteBuffer, options?: O) => T;
    encode: (file: FileInfo, fileData: FileData, options?: O) => T;

}
