import { ByteBuffer } from '@runejs/core';
import { readIndexedDataChunk } from './data/chunk';
import { decompress } from './data/compression';
import { FileIndex } from './file-index';
import { FilestoreChannels } from './data/filestore-loader';


export class FileData {

    public readonly fileId: number;
    public readonly index: FileIndex;
    public nameHash: number;
    public content: ByteBuffer;
    public crc: number;
    public whirlpool: ByteBuffer = new ByteBuffer(64);
    public version: number;
    public compression: number;
    public type: 'archive' | 'file' = 'file';
    protected readonly filestoreChannels: FilestoreChannels;

    public constructor(fileId: number, index: FileIndex, filestoreChannels: FilestoreChannels) {
        this.fileId = fileId;
        this.index = index;
        this.filestoreChannels = filestoreChannels;
    }

    public decompress(): void {
        const archiveEntry = readIndexedDataChunk(this.fileId, this.index.indexId, this.filestoreChannels);
        const { buffer } = decompress(archiveEntry?.dataFile);
        this.content = buffer;
    }

}
