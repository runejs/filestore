import { ByteBuffer } from '@runejs/core/buffer';

import { extractIndexedFile, ClientStoreChannel, ExtractedFile } from './data';
import { ClientArchive } from './client-archive';
import { decompressFile } from '../compression';
import { getFileName } from './file-naming';
import { logger } from '@runejs/core';
import { XteaDefinition } from './stores';


export class ClientFile {

    /**
     * The ID of this file within it's File Index.
     */
    public readonly fileIndex: number;

    /**
     * The File Index that this file belongs to.
     */
    public readonly archive: ClientArchive;

    /**
     * A numeric hash of the file's name.
     */
    public nameHash?: number;

    /**
     * A buffer of the file's raw data.
     */
    public fileData: ByteBuffer;

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

    protected readonly clientStoreChannel: ClientStoreChannel;
    private decompressed: boolean = false;

    /**
     * Creates a new `FileData` object.
     * @param fileIndex The ID of the file within it's File Index.
     * @param archive The File Index that this file belongs to.
     * @param clientStoreChannel The main filestore channel for data access.
     */
    public constructor(fileIndex: number, archive: ClientArchive, clientStoreChannel: ClientStoreChannel) {
        this.fileIndex = fileIndex;
        this.archive = archive;
        this.clientStoreChannel = clientStoreChannel;
    }

    /**
     * Reads the file's raw data from the main disk filestore and decompresses it.
     * @returns The decompressed file data buffer.
     */
    public decompress(): ByteBuffer {
        if(this.decompressed) {
            this.fileData.readerIndex = 0;
            this.fileData.writerIndex = 0;
            return this.fileData;
        }

        const keys = Object.values<XteaDefinition>(this.archive.clientFileStore.xteaKeys)
            .find(xtea => xtea?.name_hash === this.nameHash);
        let archiveEntry: ExtractedFile | null;

        try {
            archiveEntry = extractIndexedFile(this.fileIndex, this.archive.archiveIndex, this.clientStoreChannel);
        } catch(error) {
            archiveEntry = null;
        }

        if(!archiveEntry || !archiveEntry.dataFile?.length) {
            logger.error(`Could not find data file for file ${this.fileIndex}`);
            return null;
        }

        const { buffer } = decompressFile(archiveEntry.dataFile, keys?.key ?? undefined);
        this.fileData = buffer;
        this.decompressed = true;
        return this.fileData;
    }

    /**
     * The actual string name of the file, if it has one.
     */
    public get name(): string {
        return `${getFileName(this.nameHash) ?? this.nameHash ?? this.fileIndex}`;
    }

}
