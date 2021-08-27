import { logger } from '@runejs/core';
import { ClientFileGroup } from './client-file-group';
import { ClientFile } from './client-file';
import { ClientStoreChannel, ExtractedFile, extractIndexedFile } from './data';
import { hashFileName } from '../util';
import { ClientFileStore } from './client-file-store';
import { decompressFile } from '../compression';
import { getIndexName } from '../file-store/archive';
import { ArchiveDecompressor } from './decompression/archive-decompressor';


const NAME_FLAG = 0x01;


export class FileIndex {

    /**
     * The client file store instance for reference.
     */
    public readonly clientFileStore: ClientFileStore;

    /**
     * The ID of this File Index.
     */
    public readonly indexId: number;

    /**
     * The file format used by the File Index.
     */
    public format: number;

    /**
     * The current version of the File Index, if versioned.
     */
    public version: number;

    /**
     * The method used by the File Index for data compression.
     */
    public compression: number;

    /**
     * Additional settings and information about the File Index (name & whirlpool information).
     */
    public settings: number;

    /**
     * A map of all files housed within this File Index. Values are either an `Archive` or `FileData` object.
     */
    public files: Map<number, ClientFileGroup | ClientFile> = new Map<number, ClientFileGroup | ClientFile>();

    public readonly filestoreChannels: ClientStoreChannel;

    /**
     * Creates a new File Index with the specified index ID and filestore channel.
     * @param clientFileStore The client file store instance for reference.
     * @param indexId The ID of this File Index.
     * @param filestoreChannels The main filestore channel for data access.
     */
    public constructor(clientFileStore: ClientFileStore, indexId: number, filestoreChannels: ClientStoreChannel) {
        this.clientFileStore = clientFileStore;
        this.indexId = indexId;
        this.filestoreChannels = filestoreChannels;
    }

    /**
     * Fetches a single file from this index.
     * @param fileId The ID of the file to fetch.
     * @returns The requested FileData object, or null if no matching file was found.
     */
    public getFile(fileId: number): ClientFile | null;

    /**
     * Fetches a single file from this index.
     * @param fileName The name of the file to fetch.
     * @returns The requested FileData object, or null if no matching file was found.
     */
    public getFile(fileName: string): ClientFile | null;

    /**
     * Fetches a single file from this index.
     * @param fileIdOrName The ID or name of the file to fetch.
     * @param keys The XTEA keys.
     * @returns The requested FileData object, or null if no matching file was found.
     */
    public getFile(fileIdOrName: number | string, keys?: number[]): ClientFile | null;
    public getFile(fileIdOrName: number | string, keys?: number[]): ClientFile | null {
        let fileData: ClientFile;

        if(typeof fileIdOrName === 'string') {
            fileData = this.findByName(fileIdOrName) as ClientFile;
        } else {
            const archiveId = fileIdOrName as number;
            fileData = this.files.get(archiveId) as ClientFile;
        }

        if(!fileData) {
            return null;
        }

        if(fileData.type === 'group') {
            logger.error(fileData);
            throw new Error(`Requested item ${fileIdOrName} in index ${this.indexId} is of type Archive, not FileData.`);
        }

        try {
            fileData.decompress();
        } catch (e) {
            logger.warn(`Unable to decompress file ${fileIdOrName} in index ${this.indexId} with keys ${keys}`);
            return null;
        }

        return fileData;
    }

    /**
     * Fetches an archive from this index.
     * @param archiveId The ID of the archive to fetch.
     * @returns The requested Archive object, or null if no Archive was found.
     */
    public getArchive(archiveId: number): ClientFileGroup | null;

    /**
     * Fetches an archive from this index.
     * @param archiveName The name of the archive to fetch.
     * @returns The requested Archive object, or null if no Archive was found.
     */
    public getArchive(archiveName: string): ClientFileGroup | null;

    /**
     * Fetches an archive from this index.
     * @param archiveIdOrName The ID or name of the archive to fetch.
     * @returns The requested Archive object, or null if no Archive was found.
     */
    public getArchive(archiveIdOrName: number | string): ClientFileGroup | null;
    public getArchive(archiveIdOrName: number | string): ClientFileGroup | null {
        let archive: ClientFileGroup;

        if(typeof archiveIdOrName === 'string') {
            archive = this.findByName(archiveIdOrName) as ClientFileGroup;
        } else {
            const archiveId = archiveIdOrName as number;
            archive = this.files.get(archiveId) as ClientFileGroup;
        }

        if(!archive) {
            return null;
        }

        if(archive.type === 'file') {
            throw new Error(`Requested item ${archiveIdOrName} in index ${this.indexId} is of type FileData, not Archive.`);
        }

        archive.decodeArchiveFiles();

        return archive;
    }

    /**
     * Fetches an archive or file from this index by name.
     * @param fileName The name of the archive or file to search for.
     * @returns An Archive or FileData object, or null if no matching files were found with the specified name.
     */
    public findByName(fileName: string): ClientFileGroup | ClientFile | null {
        const indexFileCount = this.files.size;
        const nameHash = hashFileName(fileName);
        for(let fileId = 0; fileId < indexFileCount; fileId++) {
            const item = this.files.get(fileId);
            if(item?.nameHash === nameHash) {
                return item;
            }
        }

        return null;
    }

    /**
     * Decodes the packed index file data from the filestore on disk.
     */
    public decodeIndex(): void {
        let indexEntry: ExtractedFile | undefined;

        try {
            indexEntry = extractIndexedFile(this.indexId, 255, this.filestoreChannels);
            indexEntry.dataFile.readerIndex = 0;
        } catch(error) {
            logger.error(`Error decoding index ${this.indexId}:`);
            logger.error(error);
            return;
        }

        const { compression, version, buffer } = decompressFile(indexEntry.dataFile);
        buffer.readerIndex = 0;

        this.version = version;
        this.compression = compression; // index manifests are also compressed to the same level as standard files

        /* file header */
        this.format = buffer.get('byte', 'unsigned');
        this.settings = buffer.get('byte', 'unsigned');
        const fileCount = buffer.get('short', 'unsigned');

        /* file ids */
        const ids: number[] = new Array(fileCount);
        let accumulator = 0;
        for(let i = 0; i < ids.length; i++) {
            let delta = buffer.get('short', 'unsigned');
            ids[i] = accumulator += delta;
        }

        for(const id of ids) {
            this.files.set(id, new ClientFile(id, this, this.filestoreChannels));
        }

        /* read the name hashes if present */
        if((this.settings & NAME_FLAG) !== 0) {
            for(const id of ids) {
                const nameHash = buffer.get('int');
                this.files.get(id).nameHash = nameHash;
            }
        }

        /* read the crc values */
        for(const id of ids) {
            this.files.get(id).crc = buffer.get('int');
        }

        /* read the version numbers */
        for(const id of ids) {
            this.files.get(id).version = buffer.get('int');
        }

        /* read the child count */
        const members: number[][] = new Array(ids.length).fill([]);
        for(const id of ids) {
            members[id] = new Array(buffer.get('short', 'unsigned'));
        }

        /* read the child ids */
        for(const id of ids) {
            accumulator = 0;

            for(let i = 0; i < members[id].length; i++) {
                let delta = buffer.get('short', 'unsigned');
                members[id][i] = accumulator += delta;
            }

            /* allocate specific entries within the array */
            const file = this.files.get(id);
            if(members[id].length > 1) {
                if(file.type === 'file') {
                    this.files.set(id, new ClientFileGroup(file, this, this.filestoreChannels));
                }

                const archive = this.files.get(id) as ClientFileGroup;

                for(const childId of members[id]) {
                    archive.files.set(childId, new ClientFile(childId, this, this.filestoreChannels));
                }
            }
        }

        /* read the child name hashes */
        if((this.settings & NAME_FLAG) !== 0) {
            for(const id of ids) {
                const archive = this.files.get(id) as ClientFileGroup;
                for(const childId of members[id]) {
                    const nameHash = buffer.get('int');
                    if(archive?.files?.get(childId)) {
                        archive.files.get(childId).nameHash = nameHash;
                    }
                }
            }
        }
    }

    /**
     * Generates a zip archive of this client cache archive, containing all of it's indexed files.
     * @param matchMapFiles Defaults to false - Whether or not to ensure that map files have matching decrypted
     * landscape files. Setting this to true will remove all map files (mX_Y.dat) for which the corresponding
     * landscape file (if it has one) does not have any XTEA encryption keys. This helps with finding map files
     * that specifically have valid corresponding landscape files.
     * @param debug Whether or not to run the decompressor tools in debug mode - this will prevent files from
     * being written to the disk and will only run the decompression and file conversion code. Debug mode will
     * still write .index files to /output/stores.
     */
    public async decompressArchive(matchMapFiles: boolean = false, debug: boolean = false): Promise<void> {
        const decompressor = new ArchiveDecompressor(this);
        await decompressor.decompressArchive(matchMapFiles, debug);
    }

    public get name(): string {
        return getIndexName(this.indexId) as string;
    }

}
