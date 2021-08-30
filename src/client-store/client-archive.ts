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
     * The client file store that this archive belongs to.
     */
    public readonly clientFileStore: ClientFileStore;

    /**
     * The client store channel from which the archive data was pulled from.
     */
    public readonly clientStoreChannel: ClientStoreChannel;

    /**
     * The index of this archive within the JS5 client file store.
     */
    public readonly archiveIndex: number;

    /**
     * The file format used by the archive (usually `5`).
     */
    public format: number;

    /**
     * The current version of the archive, if versioned.
     */
    public version: number;

    /**
     * The file compression method used to compress the archive and it's file.
     */
    public compression: number;

    /**
     * Save the hashed name of each file in the archive's index data.
     */
    public saveFileNames: number;

    /**
     * A map of all indexed file groups in this archive.
     */
    public groups: Map<number, ClientFileGroup> = new Map<number, ClientFileGroup>();

    /**
     * Creates a new client store archive instance with the specified index.
     * @param clientFileStore The client file store that the archive belongs to.
     * @param archiveIndex The index of this archive within the file store.
     * @param clientStoreChannel The client file store channel for data access.
     */
    public constructor(clientFileStore: ClientFileStore, archiveIndex: number, clientStoreChannel: ClientStoreChannel) {
        this.clientFileStore = clientFileStore;
        this.archiveIndex = archiveIndex;
        this.clientStoreChannel = clientStoreChannel;
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
            fileData = this.groups[fileIndexOrName as number] as ClientFile;
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
    public getFileGroup(fileGroupIndex: number): ClientFileGroup | null;

    /**
     * Fetches a file group from this index.
     * @param fileGroupName The name of the file group to fetch.
     * @returns The requested file group object, or null if no file group was found.
     */
    public getFileGroup(fileGroupName: string): ClientFileGroup | null;

    /**
     * Fetches a file group from this index.
     * @param fileGroupIndexOrName The ID or name of the file group to fetch.
     * @returns The requested Archive object, or null if no Archive was found.
     */
    public getFileGroup(fileGroupIndexOrName: number | string): ClientFileGroup | null;
    public getFileGroup(fileGroupIndexOrName: number | string): ClientFileGroup | null {
        let archive: ClientFileGroup;

        if(typeof fileGroupIndexOrName === 'string') {
            archive = this.findByName(fileGroupIndexOrName) as ClientFileGroup;
        } else {
            archive = this.groups[fileGroupIndexOrName as number] as ClientFileGroup;
        }

        if(!archive) {
            return null;
        }

        if(archive.type === 'file') {
            throw new Error(`Requested item ${fileGroupIndexOrName} in index ${this.archiveIndex} is of type FileData, not Archive.`);
        }

        archive.decodeGroupFiles();

        return archive;
    }

    /**
     * Fetches an archive or file from this index by name.
     * @param fileName The name of the archive or file to search for.
     * @returns An Archive or FileData object, or null if no matching files were found with the specified name.
     */
    public findByName(fileName: string): ClientFileGroup | ClientFile | null {
        const nameHash = hashFileName(fileName);
        for(const [ , file ] of this.groups) {
            if(file?.nameHash === nameHash) {
                return file;
            }
        }
        return null;
    }

    /**
     * Fetches the archive's index data from the client store data channel.
     */
    public getIndexFile(): StoreFile {
        try {
            const archiveIndex = extractIndexedFile(this.archiveIndex, 255, this.clientStoreChannel);
            archiveIndex.dataFile.readerIndex = 0;
            return decompressFile(archiveIndex.dataFile);
        } catch(error) {
            logger.error(`Error decoding index ${this.archiveIndex}:`);
            logger.error(error);
            return null;
        }
    }

    /**
     * Decodes the archive file data from the client store data channel.
     */
    public decodePackedArchive(): void {
        const indexFile = this.getIndexFile();
        if(!indexFile) {
            logger.error(`Index file error.`);
            return;
        }

        logger.info(`Decoding archive ${this.name}...`);

        const { compression, version, buffer } = indexFile;

        buffer.readerIndex = 0;

        this.groups.clear();
        this.version = version;
        this.compression = compression; // index manifests are also compressed to the same level as standard files

        this.format = buffer.get('byte', 'unsigned');
        this.saveFileNames = buffer.get('byte', 'unsigned');

        const fileCount = buffer.get('short', 'unsigned');

        const groupIndices: number[] = new Array(fileCount);

        logger.info(`${fileCount} file(s) found.`);

        let accumulator = 0;
        // @TODO next
        for(let i = 0; i < fileCount; i++) {
            const delta = buffer.get('short', 'unsigned');
            groupIndices[i] = accumulator += delta;
            this.groups.set(groupIndices[i], new ClientFileGroup(groupIndices[i], this, this.clientStoreChannel));
        }

        if((this.saveFileNames & NAME_FLAG) !== 0) {
            for(const groupIndex of groupIndices) {
                this.groups.get(groupIndex).nameHash = buffer.get('int');
            }
        }

        /* read the crc values */
        for(const groupIndex of groupIndices) {
            this.groups.get(groupIndex).crc = buffer.get('int');
        }

        /* read the version numbers */
        for(const groupIndex of groupIndices) {
            this.groups.get(groupIndex).version = buffer.get('int');
        }

        /* read the child count */
        const groupFileIndices: Map<number, number[]> = new Map<number, number[]>();

        for(const groupIndex of groupIndices) {
            // group file count
            groupFileIndices.set(groupIndex, new Array(buffer.get('short', 'unsigned')));
        }

        /* read the file groupIndices */
        for(const groupIndex of groupIndices) {
            const group = this.groups.get(groupIndex);
            const fileIndices = groupFileIndices.get(groupIndex);

            accumulator = 0;
            for(let i = 0; i < fileIndices.length; i++) {
                const delta = buffer.get('short', 'unsigned');
                fileIndices[i] = accumulator += delta;
            }

            if(fileIndices.length > 1) {
                fileIndices.forEach(index => group.files.set(index, null));
            } else if(!fileIndices.length || group.files.size <= 1) {
                group.singleFile = true;
                group.files.set(0, new ClientFile(groupIndex, this, this.clientStoreChannel));
            }
        }

        /* read the child name hashes */
        if((this.saveFileNames & NAME_FLAG) !== 0) {
            for(const groupIndex of groupIndices) {
                const fileGroup = this.groups.get(groupIndex);
                if(fileGroup?.files?.size) {
                    const fileIndices = groupFileIndices.get(groupIndex);
                    for(const childIndex of fileIndices) {
                        const nameHash = buffer.get('int');
                        if(fileGroup.files.get(childIndex)) {
                            fileGroup.files.get(childIndex).nameHash = nameHash;
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
        const decompressor = new ArchiveDecompressor(this);
        await decompressor.decompressArchive(matchMapFiles, debug);
    }

    public get name(): string {
        return getIndexName(this.archiveIndex) as string;
    }

}
