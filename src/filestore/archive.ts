import { ByteBuffer } from '@runejs/common';

import { FileData } from './file-data';
import type { FileIndex } from './file-index';
import {
    type FilestoreChannels,
    readIndexedDataChunk,
    decompress,
} from './data';

export class Archive extends FileData {
    /**
     * A map of files housed within this Archive.
     */
    public files: Map<number, FileData>;

    /**
     * The type of file, either an `archive` or a plain `file`.
     */
    public type: 'archive' | 'file' = 'archive';

    private decoded = false;

    /**
     * Creates a new `Archive` object.
     * @param id The ID of the Archive within it's File Index.
     * @param index The File Index that this Archive belongs to.
     * @param filestoreChannels The main filestore channel for data access.
     */
    public constructor(
        id: number,
        index: FileIndex,
        filestoreChannels: FilestoreChannels,
    );

    /**
     * Creates a new `Archive` object.
     * @param fileData Data about a file that's being recognized as an Archive.
     * @param index The File Index that this Archive belongs to.
     * @param filestoreChannels The main filestore channel for data access.
     */
    public constructor(
        fileData: FileData,
        index: FileIndex,
        filestoreChannels: FilestoreChannels,
    );

    public constructor(
        idOrFileData: number | FileData,
        index: FileIndex,
        filestoreChannels: FilestoreChannels,
    ) {
        super(
            typeof idOrFileData === 'number'
                ? idOrFileData
                : idOrFileData.fileId,
            index,
            filestoreChannels,
        );

        if (typeof idOrFileData !== 'number') {
            const fileData = idOrFileData as FileData;
            const { content, nameHash, crc, whirlpool, version, compression } =
                fileData;
            this.content = content;
            this.nameHash = nameHash;
            this.crc = crc;
            this.whirlpool = whirlpool;
            this.version = version;
            this.compression = compression;
        }

        this.files = new Map<number, FileData>();
    }

    /**
     * Fetches a file from this Archive by ID.
     * @param fileId The ID of the file to find.
     */
    public getFile(fileId: number): FileData | null {
        return this.files.get(fileId) || null;
    }

    /**
     * Decodes the packed Archive files from the filestore on disk.
     */
    public decodeArchiveFiles(): void {
        if (this.decoded) {
            return;
        }

        const archiveEntry = readIndexedDataChunk(
            this.fileId,
            this.index.indexId,
            this.filestoreChannels,
        );
        const { compression, version, buffer } = decompress(
            archiveEntry.dataFile,
        );
        const archiveSize = this.files.size;

        this.content = buffer;

        this.version = version;
        this.content = buffer;
        this.compression = compression;
        this.files.clear();
        buffer.readerIndex = buffer.length - 1;
        const chunkCount = buffer.get('BYTE', 'UNSIGNED');

        const chunkSizes: number[][] = new Array(chunkCount).fill(
            new Array(archiveSize),
        );
        const sizes: number[] = new Array(archiveSize).fill(0);
        buffer.readerIndex = buffer.length - 1 - chunkCount * archiveSize * 4;
        for (let chunk = 0; chunk < chunkCount; chunk++) {
            let chunkSize = 0;
            for (let id = 0; id < archiveSize; id++) {
                const delta = buffer.get('INT');
                chunkSize += delta;

                chunkSizes[chunk][id] = chunkSize;
                sizes[id] += chunkSize;
            }
        }

        for (let id = 0; id < archiveSize; id++) {
            const fileData = new FileData(
                id,
                this.index,
                this.filestoreChannels,
            );
            fileData.content = new ByteBuffer(sizes[id]);
            this.files.set(id, fileData);
        }

        buffer.readerIndex = 0;

        for (let chunk = 0; chunk < chunkCount; chunk++) {
            for (let id = 0; id < archiveSize; id++) {
                const chunkSize = chunkSizes[chunk][id];
                this.files
                    .get(id)
                    .content.putBytes(
                        buffer.getSlice(buffer.readerIndex, chunkSize),
                    );
                buffer.copy(
                    this.files.get(id).content,
                    0,
                    buffer.readerIndex,
                    buffer.readerIndex + chunkSize,
                );
                buffer.readerIndex = buffer.readerIndex + chunkSize;
            }
        }

        this.decoded = true;
    }
}
