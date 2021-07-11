import { ByteBuffer } from '@runejs/core/buffer';

import { ClientFile } from './client-file';
import { FileIndex } from './file-index';
import { ClientStoreChannel, extractIndexedFile } from './data';
import { decompressFile } from '../compression';


export class ClientFileGroup extends ClientFile {

    /**
     * A map of files housed within this Archive.
     */
    public files: Map<number, ClientFile>;

    /**
     * The type of file, either an `archive` or a plain `file`.
     */
    public type: 'archive' | 'file' = 'archive';

    public groupCompressedSize: number = 0;

    private decoded: boolean = false;

    /**
     * Creates a new `Archive` object.
     * @param id The ID of the Archive within it's File Index.
     * @param index The File Index that this Archive belongs to.
     * @param filestoreChannels The main filestore channel for data access.
     */
    public constructor(id: number, index: FileIndex, filestoreChannels: ClientStoreChannel);

    /**
     * Creates a new `Archive` object.
     * @param fileData Data about a file that's being recognized as an Archive.
     * @param index The File Index that this Archive belongs to.
     * @param filestoreChannels The main filestore channel for data access.
     */
    public constructor(fileData: ClientFile, index: FileIndex, filestoreChannels: ClientStoreChannel);

    public constructor(idOrFileData: number | ClientFile, index: FileIndex, filestoreChannels: ClientStoreChannel) {
        super(typeof idOrFileData === 'number' ? idOrFileData : idOrFileData.fileId, index, filestoreChannels);

        if(typeof idOrFileData !== 'number') {
            const fileData = idOrFileData as ClientFile;
            const { content, nameHash, crc, whirlpool, version, compression } = fileData;
            this.content = content;
            this.nameHash = nameHash;
            this.crc = crc;
            this.whirlpool = whirlpool;
            this.version = version;
            this.compression = compression;
        }

        this.files = new Map<number, ClientFile>();
    }

    /**
     * Fetches a file from this Archive by ID.
     * @param fileId The ID of the file to find.
     */
    public getFile(fileId: number): ClientFile | null {
        return this.files.get(fileId) || null;
    }

    /**
     * Decodes the packed Archive files from the filestore on disk.
     */
    public decodeArchiveFiles(): void {
        if(this.decoded) {
            return;
        }

        const archiveEntry = extractIndexedFile(this.fileId, this.index.indexId, this.filestoreChannels);
        archiveEntry.dataFile.readerIndex = 0;
        this.groupCompressedSize = archiveEntry.dataFile.length;
        const { compression, version, buffer } = decompressFile(archiveEntry.dataFile);
        buffer.readerIndex = 0;
        const archiveSize = this.files.size;

        this.content = buffer;

        this.version = version;
        this.content = buffer;
        this.compression = compression;
        this.files.clear();
        buffer.readerIndex = (buffer.length - 1);
        const stripeCount = buffer.get('byte', 'unsigned');

        const stripeLengths: number[][] = new Array(stripeCount).fill(new Array(archiveSize));
        const sizes: number[] = new Array(archiveSize).fill(0);
        buffer.readerIndex = (buffer.length - 1 - stripeCount * archiveSize * 4);
        for(let stripe = 0; stripe < stripeCount; stripe++) {
            let currentLength = 0;
            for(let id = 0; id < archiveSize; id++) {
                const stripeSize = buffer.get('int');
                currentLength += stripeSize;

                stripeLengths[stripe][id] = currentLength;
                sizes[id] += currentLength;
            }
        }

        for(let id = 0; id < archiveSize; id++) {
            const fileData = new ClientFile(id, this.index, this.filestoreChannels);
            fileData.content = new ByteBuffer(sizes[id]);
            this.files.set(id, fileData);
        }

        buffer.readerIndex = 0;

        for(let chunk = 0; chunk < stripeCount; chunk++) {
            for(let id = 0; id < archiveSize; id++) {
                const chunkSize = stripeLengths[chunk][id];
                this.files.get(id).content.putBytes(buffer.getSlice(buffer.readerIndex, chunkSize));

                let sourceEnd: number = buffer.readerIndex + chunkSize;
                if(buffer.readerIndex + chunkSize >= buffer.length) {
                    sourceEnd = buffer.length;
                }

                buffer.copy(this.files.get(id).content, 0, buffer.readerIndex, sourceEnd);
                buffer.readerIndex = sourceEnd;
            }
        }

        this.decoded = true;
    }

}
