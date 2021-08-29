import { logger } from '@runejs/core';
import { ClientFileGroup } from './client-file-group';
import { ClientFile } from './client-file';
import { ClientStoreChannel, extractIndexedFile } from './data';
import { hashFileName } from '../util';
import { ClientFileStore } from './client-file-store';
import { decompressFile, StoreFile } from '../compression';
import { getIndexName } from '../file-store';
import { ArchiveDecompressor } from './decompression/archive-decompressor';


const NAME_FLAG = 0x01;


export class ClientArchive {

    /**
     * The client file store instance for reference.
     */
    public readonly clientFileStore: ClientFileStore;

    /**
     * The index of this archive within the JS5 filestore.
     */
    public readonly archiveIndex: number;

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
     * An array of all files housed within this File Index. Either `ClientFileGroup` or `ClientFile`.
     */
    public files: Map<number, ClientFile | ClientFileGroup> = new Map<number, ClientFileGroup | ClientFile>();

    public readonly filestoreChannels: ClientStoreChannel;

    /**
     * Creates a new File Index with the specified index ID and filestore channel.
     * @param clientFileStore The client file store instance for reference.
     * @param indexId The ID of this File Index.
     * @param filestoreChannels The main filestore channel for data access.
     */
    public constructor(clientFileStore: ClientFileStore, indexId: number, filestoreChannels: ClientStoreChannel) {
        this.clientFileStore = clientFileStore;
        this.archiveIndex = indexId;
        this.filestoreChannels = filestoreChannels;
    }

    /**
     * Fetches a single file from this index.
     * @param fileIndex The ID of the file to fetch.
     * @returns The requested FileData object, or null if no matching file was found.
     */
    public getFile(fileIndex: number): ClientFile | null;

    /**
     * Fetches a single file from this index.
     * @param fileName The name of the file to fetch.
     * @returns The requested FileData object, or null if no matching file was found.
     */
    public getFile(fileName: string): ClientFile | null;

    /**
     * Fetches a single file from this index.
     * @param fileIndexOrName The index or name of the file to fetch.
     * @param keys The XTEA keys.
     * @returns The requested FileData object, or null if no matching file was found.
     */
    public getFile(fileIndexOrName: number | string, keys?: number[]): ClientFile | null;
    public getFile(fileIndexOrName: number | string, keys?: number[]): ClientFile | null {
        let fileData: ClientFile;

        if(typeof fileIndexOrName === 'string') {
            fileData = this.findByName(fileIndexOrName) as ClientFile;
        } else {
            fileData = this.files[fileIndexOrName as number] as ClientFile;
        }

        if(!fileData) {
            return null;
        }

        if(fileData.type === 'group') {
            logger.error(fileData);
            throw new Error(`Requested item ${fileIndexOrName} in index ${this.archiveIndex} is of type Archive, not FileData.`);
        }

        try {
            fileData.decompress();
        } catch (e) {
            logger.warn(`Unable to decompress file ${fileIndexOrName} in index ${this.archiveIndex} with keys ${keys}`);
            return null;
        }

        return fileData;
    }

    /**
     * Fetches a file group from this index.
     * @param fileGroupIndex The index of the file group to fetch.
     * @returns The requested file group object, or null if no file group was found.
     */
    public getArchive(fileGroupIndex: number): ClientFileGroup | null;

    /**
     * Fetches a file group from this index.
     * @param fileGroupName The name of the file group to fetch.
     * @returns The requested file group object, or null if no file group was found.
     */
    public getArchive(fileGroupName: string): ClientFileGroup | null;

    /**
     * Fetches a file group from this index.
     * @param fileGroupIndexOrName The ID or name of the file group to fetch.
     * @returns The requested Archive object, or null if no Archive was found.
     */
    public getArchive(fileGroupIndexOrName: number | string): ClientFileGroup | null;
    public getArchive(fileGroupIndexOrName: number | string): ClientFileGroup | null {
        let archive: ClientFileGroup;

        if(typeof fileGroupIndexOrName === 'string') {
            archive = this.findByName(fileGroupIndexOrName) as ClientFileGroup;
        } else {
            archive = this.files[fileGroupIndexOrName as number] as ClientFileGroup;
        }

        if(!archive) {
            return null;
        }

        if(archive.type === 'file') {
            throw new Error(`Requested item ${fileGroupIndexOrName} in index ${this.archiveIndex} is of type FileData, not Archive.`);
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
        const nameHash = hashFileName(fileName);
        for(const [ , file ] of this.files) {
            if(file?.nameHash === nameHash) {
                return file;
            }
        }
        return null;
    }

    public getIndexFile(): StoreFile {
        try {
            const archiveIndex = extractIndexedFile(this.archiveIndex, 255, this.filestoreChannels);
            return decompressFile(archiveIndex.dataFile);
        } catch(error) {
            logger.error(`Error decoding index ${this.archiveIndex}:`);
            logger.error(error);
            return null;
        }
    }

    /**
     * Decodes the archive file data from the packed client cache on disk.
     */
    public decodePackedArchive(): void {
        const indexFile = this.getIndexFile();
        if(!indexFile) {
            return;
        }

        const { compression, version, buffer } = indexFile;

        buffer.readerIndex = 0;

        this.version = version;
        this.compression = compression; // index manifests are also compressed to the same level as standard files

        this.format = buffer.get('byte', 'unsigned');
        this.settings = buffer.get('byte', 'unsigned');

        const fileCount = buffer.get('short', 'unsigned');

        const indexes: number[] = new Array(fileCount);

        let accumulator = 0;
        for(let i = 0; i < fileCount; i++) {
            const delta = buffer.get('short', 'unsigned');
            const fileIndex = accumulator += delta;
            indexes[i] = fileIndex;
            this.files.set(fileIndex, new ClientFile(fileIndex, this, this.filestoreChannels));
        }

        if((this.settings & NAME_FLAG) !== 0) {
            for(const index of indexes) {
                this.files.get(index).nameHash = buffer.get('int');
            }
        }

        /* read the crc values */
        for(const index of indexes) {
            this.files.get(index).crc = buffer.get('int');
        }

        /* read the version numbers */
        for(const index of indexes) {
            this.files.get(index).version = buffer.get('int');
        }

        /* read the child count */
        const childIndexes: Map<number, number[]> = new Map<number, number[]>();

        for(const index of indexes) {
            // group child count
            childIndexes.set(index, new Array(buffer.get('short', 'unsigned')));
        }

        /* read the child indexes */
        for(const index of indexes) {
            accumulator = 0;
            for(let i = 0; i < childIndexes.get(index).length; i++) {
                const delta = buffer.get('short', 'unsigned');
                childIndexes.get(index)[i] = (accumulator += delta);
            }

            const file = this.files.get(index);

            if(childIndexes.get(index).length > 1) {
                if(file.type === 'file') {
                    this.files.set(index, new ClientFileGroup(file, this, this.filestoreChannels));
                }

                const fileGroup = this.files.get(index) as ClientFileGroup;

                for(const childIndex of childIndexes.get(index)) {
                    fileGroup.children.set(childIndex, new ClientFile(childIndex, this, this.filestoreChannels));
                }
            }
        }

        /* read the child name hashes */
        if((this.settings & NAME_FLAG) !== 0) {
            for(const index of indexes) {
                const fileGroup = this.files.get(index) as ClientFileGroup;

                if(fileGroup?.children?.size) {
                    for(const childIndex of childIndexes.get(index)) {
                        const nameHash = buffer.get('int');

                        if(fileGroup.children.get(childIndex)) {
                            fileGroup.children.get(childIndex).nameHash = nameHash;
                        }
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
        if(!this.files.size) {
            this.decodePackedArchive();
        }
        const decompressor = new ArchiveDecompressor(this);
        await decompressor.decompressArchive(matchMapFiles, debug);
    }

    public get name(): string {
        return getIndexName(this.archiveIndex) as string;
    }

}
