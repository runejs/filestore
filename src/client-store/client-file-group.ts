import { ByteBuffer } from '@runejs/core/buffer';

import { ClientFile } from './client-file';
import { ClientArchive } from './client-archive';
import { ClientStoreChannel, extractIndexedFile } from './data';
import { decompressFile } from '../compression';


export class ClientFileGroup extends ClientFile {

    /**
     * A list of files housed within this file group.
     */
    public children: Map<number, ClientFile> = new Map<number, ClientFile>();

    /**
     * The type of file, either a `group` or a plain `file`.
     */
    public type: 'group' | 'file' = 'group';

    public groupCompressedSize: number = 0;

    private decoded: boolean = false;

    /**
     * Creates a new file group object.
     * @param fileIndex The index of the group within it's archive.
     * @param archive The archive that the group belongs to.
     * @param filestoreChannels The main file store channel for data access.
     */
    public constructor(fileIndex: number, archive: ClientArchive, filestoreChannels: ClientStoreChannel);

    /**
     * Creates a new file group object.
     * @param fileData Data about a file that's being recognized as an Archive.
     * @param archive The archive that the group belongs to.
     * @param filestoreChannels The main file store channel for data access.
     */
    public constructor(fileData: ClientFile, archive: ClientArchive, filestoreChannels: ClientStoreChannel);

    public constructor(idOrFileData: number | ClientFile, archive: ClientArchive, filestoreChannels: ClientStoreChannel) {
        super(typeof idOrFileData === 'number' ? idOrFileData : idOrFileData.fileId, archive, filestoreChannels);

        if(typeof idOrFileData !== 'number') {
            const fileData = idOrFileData as ClientFile;
            const { content, nameHash, crc, version, compression } = fileData;
            this.content = content;
            this.nameHash = nameHash;
            this.crc = crc;
            this.version = version;
            this.compression = compression;
        }
    }

    /**
     * Fetches a file from this group by index.
     * @param childIndex The index of the file to find.
     */
    public getFile(childIndex: number): ClientFile | null {
        return this.children.get(childIndex) || null;
    }

    /**
     * Decodes the packed group files from the file store on disk.
     */
    public decodeArchiveFiles(): void {
        if(this.decoded) {
            return;
        }

        const archiveEntry = extractIndexedFile(this.fileId, this.index.archiveIndex, this.filestoreChannels);
        archiveEntry.dataFile.readerIndex = 0;
        this.groupCompressedSize = archiveEntry.dataFile.length;
        const { compression, version, buffer } = decompressFile(archiveEntry.dataFile);
        buffer.readerIndex = 0;
        const groupSize = this.children.size;

        this.content = buffer;

        this.version = version;
        this.content = buffer;
        this.compression = compression;

        buffer.readerIndex = (buffer.length - 1);

        const stripeCount = buffer.get('byte', 'unsigned');
        const stripeLengths: number[][] = new Array(stripeCount).fill(new Array(groupSize));
        const sizes: number[] = new Array(groupSize).fill(0);

        buffer.readerIndex = (buffer.length - 1 - stripeCount * groupSize * 4);

        for(let stripe = 0; stripe < stripeCount; stripe++) {
            let currentLength = 0;
            for(let id = 0; id < groupSize; id++) {
                const stripeSize = buffer.get('int');
                currentLength += stripeSize;

                stripeLengths[stripe][id] = currentLength;
                sizes[id] += currentLength;
            }
        }

        for(let childIndex = 0; childIndex < groupSize; childIndex++) {
            const fileData = new ClientFile(childIndex, this.index, this.filestoreChannels);
            fileData.content = new ByteBuffer(sizes[childIndex]);
            this.children.set(childIndex, fileData);
        }

        buffer.readerIndex = 0;

        for(let chunk = 0; chunk < stripeCount; chunk++) {
            for(let id = 0; id < groupSize; id++) {
                const chunkSize = stripeLengths[chunk][id];
                this.children.get(id).content.putBytes(buffer.getSlice(buffer.readerIndex, chunkSize));

                let sourceEnd: number = buffer.readerIndex + chunkSize;
                if(buffer.readerIndex + chunkSize >= buffer.length) {
                    sourceEnd = buffer.length;
                }

                buffer.copy(this.children.get(id).content, 0, buffer.readerIndex, sourceEnd);
                buffer.readerIndex = sourceEnd;
            }
        }

        this.decoded = true;
    }

}
