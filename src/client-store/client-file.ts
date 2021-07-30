import { ByteBuffer } from '@runejs/core/buffer';

import { extractIndexedFile, ClientStoreChannel } from './data';
import { FileIndex } from './file-index';
import { decompressFile } from '../compression';
import { getFileName } from './file-naming';


export class ClientFile {

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
    public nameHash?: number;

    /**
     * A buffer of the file's raw data.
     */
    public content: ByteBuffer;

    /**
     * CRC value of the file's data.
     */
    public crc: number;

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
    public type: 'group' | 'file' = 'file';

    protected readonly filestoreChannels: ClientStoreChannel;
    private decompressed: boolean = false;

    /**
     * Creates a new `FileData` object.
     * @param fileId The ID of the file within it's File Index.
     * @param index The File Index that this file belongs to.
     * @param filestoreChannels The main filestore channel for data access.
     */
    public constructor(fileId: number, index: FileIndex, filestoreChannels: ClientStoreChannel) {
        this.fileId = fileId;
        this.index = index;
        this.filestoreChannels = filestoreChannels;
    }

    /**
     * Reads the file's raw data from the main disk filestore and decompresses it.
     * @returns The decompressed file data buffer.
     */
    public decompress(): ByteBuffer {
        if(this.decompressed) {
            this.content.readerIndex = 0;
            this.content.writerIndex = 0;
            return this.content;
        }

        const keys = this.index.clientFileStore.xteas[this.name] || undefined;

        this.decompressed = true;
        const archiveEntry = extractIndexedFile(this.fileId, this.index.indexId, this.filestoreChannels);
        const { buffer } = decompressFile(archiveEntry?.dataFile, keys);
        this.content = buffer;
        return this.content;
    }

    /**
     * The actual string name of the file, if it has one.
     */
    public get name(): string {
        return `${getFileName(this.nameHash) ?? this.nameHash ?? this.fileId}`;
    }

}
