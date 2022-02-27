import { ByteBuffer } from '@runejs/common';

import { decompress, readIndexedDataChunk, FilestoreChannels } from './data';
import { FileIndex } from './file-index';


export class FileData {

    /**
     * The ID of this file within it's File Index.
     */
    public readonly fileId: number;

    /**
     * The File Index that this file belongs to.
     */
    public readonly index: FileIndex;

    /**
     * A numeric hash of the file's name.
     */
    public nameHash: number;

    /**
     * A buffer of the file's raw data.
     */
    public content: ByteBuffer;

    /**
     * CRC value of the file's data.
     */
    public crc: number;

    /**
     * Whirlpool value of the file's data.
     */
    public whirlpool: ByteBuffer = new ByteBuffer(64);

    /**
     * Version number of the file.
     */
    public version: number;

    /**
     * The compression method used by the file in storage.
     */
    public compression: number;

    /**
     * The type of file, either an `archive` or a plain `file`.
     */
    public type: 'archive' | 'file' = 'file';

    protected readonly filestoreChannels: FilestoreChannels;
    private decompressed: boolean = false;

    /**
     * Creates a new `FileData` object.
     * @param fileId The ID of the file within it's File Index.
     * @param index The File Index that this file belongs to.
     * @param filestoreChannels The main filestore channel for data access.
     */
    public constructor(fileId: number, index: FileIndex, filestoreChannels: FilestoreChannels) {
        this.fileId = fileId;
        this.index = index;
        this.filestoreChannels = filestoreChannels;
    }

    /**
     * Reads the file's raw data from the main disk filestore and decompresses it.
     * @param keys The XTEA keys.
     * @returns The decompressed file data buffer.
     */
    public decompress(keys?: number[]): ByteBuffer {
        if(this.decompressed) {
            this.content.readerIndex = 0;
            this.content.writerIndex = 0;
            return this.content;
        }

        this.decompressed = true;
        const archiveEntry = readIndexedDataChunk(this.fileId, this.index.indexId, this.filestoreChannels);
        const { buffer } = decompress(archiveEntry?.dataFile, keys);
        this.content = buffer;
        return this.content;
    }

}
