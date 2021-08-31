import { ByteBuffer } from '@runejs/core/buffer';

import { ClientFile } from './client-file';
import { ClientArchive } from './client-archive';
import { ClientStoreChannel, extractIndexedFile } from './data';
import { decompressFile } from '../compression';


export class ClientFileGroup extends ClientFile {

    /**
     * A list of files housed within this file group.
     */
    public files: Map<number, ClientFile> = new Map<number, ClientFile>();

    public fileIndices: number[];

    /**
     * The type of file, either a `group` or a plain `file`.
     */
    public type: 'group' | 'file' = 'group';

    public groupCompressedSize: number = 0;
    public singleFile: boolean = false;

    private decoded: boolean = false;

    /**
     * Creates a new file group object.
     * @param fileIndex The index of the group within it's archive.
     * @param archive The archive that the group belongs to.
     * @param filestoreChannels The main file store channel for data access.
     * @param singleFile If the group is meant only for single file storage.
     */
    public constructor(fileIndex: number, archive: ClientArchive, filestoreChannels: ClientStoreChannel, singleFile?: boolean);

    /**
     * Creates a new file group object.
     * @param fileData Data about a file that's being recognized as an Archive.
     * @param archive The archive that the group belongs to.
     * @param filestoreChannels The main file store channel for data access.
     * @param singleFile If the group is meant only for single file storage.
     */
    public constructor(fileData: ClientFile, archive: ClientArchive, filestoreChannels: ClientStoreChannel, singleFile?: boolean);

    public constructor(idOrFileData: number | ClientFile, archive: ClientArchive,
                       filestoreChannels: ClientStoreChannel, singleFile?: boolean) {
        super(typeof idOrFileData === 'number' ? idOrFileData : idOrFileData.fileIndex, archive, filestoreChannels);

        if(typeof idOrFileData !== 'number') {
            const clientFile = idOrFileData as ClientFile;
            const { fileData, nameHash, crc, version, compression } = clientFile;
            this.fileData = fileData;
            this.nameHash = nameHash;
            this.crc = crc;
            this.version = version;
            this.compression = compression;
        }

        if(singleFile) {
            this.singleFile = true;
        }
    }

    /**
     * Fetches a file from this group by index.
     * @param childIndex The index of the file to find.
     */
    public getFile(childIndex: number): ClientFile | null {
        return this.files.get(childIndex) || null;
    }

    /**
     * Decodes the packed group files from the file store on disk.
     */
    public decodeGroupFiles(): void {
        if(this.singleFile || this.decoded) {
            return;
        }

        const archiveEntry = extractIndexedFile(this.fileIndex, this.archive.archiveIndex, this.clientStoreChannel);
        archiveEntry.dataFile.readerIndex = 0;
        this.groupCompressedSize = archiveEntry.dataFile.length;
        const { compression, version, buffer } = decompressFile(archiveEntry.dataFile);
        buffer.readerIndex = 0;
        const groupSize = this.files.size;

        this.fileData = buffer;

        this.version = version;
        this.fileData = buffer;
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
            const fileData = new ClientFile(childIndex, this.archive, this.clientStoreChannel);
            fileData.fileData = new ByteBuffer(sizes[childIndex]);
            this.files.set(childIndex, fileData);
        }

        buffer.readerIndex = 0;

        for(let chunk = 0; chunk < stripeCount; chunk++) {
            for(let id = 0; id < groupSize; id++) {
                const chunkSize = stripeLengths[chunk][id];
                this.files.get(id).fileData.putBytes(buffer.getSlice(buffer.readerIndex, chunkSize));

                let sourceEnd: number = buffer.readerIndex + chunkSize;
                if(buffer.readerIndex + chunkSize >= buffer.length) {
                    sourceEnd = buffer.length;
                }

                buffer.copy(this.files.get(id).fileData, 0, buffer.readerIndex, sourceEnd);
                buffer.readerIndex = sourceEnd;
            }
        }

        for(const [ key, file ] of this.files) {
            if(!file) {
                this.files.delete(key);
            }
        }

        this.decoded = true;
    }

}
