import { logger } from '@runejs/core';
import { ClientFileGroup } from './client-file-group';
import { ClientFile } from './client-file';
import { ClientStoreChannel, extractIndexedFile } from './data';
import { hashFileName } from '../util';
import { ClientFileStore } from './client-file-store';
import { decompressFile, StoreFile } from '../compression';
import { getIndexName } from '../file-store';
import { ArchiveDecompressor } from './decompression/archive-decompressor';
import { DecompressionOptions } from './decompression/decompression-options';


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
    public groups: Map<string, ClientFileGroup> = new Map<string, ClientFileGroup>();

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
     * @returns The requested FileData object, or null if no matching file was found.
     */
    public getFile(fileIndexOrName: number | string): ClientFile | null;
    public getFile(fileIndexOrName: number | string): ClientFile | null {
        let fileData: ClientFile;

        if(typeof fileIndexOrName === 'string') {
            fileData = this.findByName(fileIndexOrName) as ClientFile;
        } else {
            fileData = this.getGroup(fileIndexOrName) as ClientFile;
        }

        if(!fileData) {
            return null;
        }

        return fileData;
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
            return decompressFile(extractIndexedFile(this.archiveIndex, 255, this.clientStoreChannel).dataFile);
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
            this.setGroup(groupIndices[i], new ClientFileGroup(groupIndices[i], this, this.clientStoreChannel));
        }

        if((this.saveFileNames & NAME_FLAG) !== 0) {
            for(const groupIndex of groupIndices) {
                this.getGroup(groupIndex).nameHash = buffer.get('int');
            }
        }

        /* read the crc values */
        for(const groupIndex of groupIndices) {
            this.getGroup(groupIndex).crc = buffer.get('int');
        }

        /* read the version numbers */
        for(const groupIndex of groupIndices) {
            this.getGroup(groupIndex).version = buffer.get('int');
        }

        /* read the child count */
        const groupChildCounts: Map<number, number> = new Map<number, number>();

        for(const groupIndex of groupIndices) {
            // group file count
            groupChildCounts.set(groupIndex, buffer.get('short', 'unsigned'));
        }

        /* read the file groupIndices */
        for(const groupIndex of groupIndices) {
            const group = this.getGroup(groupIndex);
            const fileCount = groupChildCounts.get(groupIndex);

            accumulator = 0;
            for(let i = 0; i < fileCount; i++) {
                const delta = buffer.get('short', 'unsigned');
                const childFileIndex = accumulator += delta;
                group.setFile(childFileIndex, new ClientFile(childFileIndex, this, this.clientStoreChannel));
            }
        }

        /* read the child name hashes */
        if((this.saveFileNames & NAME_FLAG) !== 0) {
            for(const groupIndex of groupIndices) {
                const fileGroup = this.getGroup(groupIndex);

                if((this.saveFileNames & NAME_FLAG) !== 0 && fileGroup.files.size <= 1) {
                    fileGroup.getFile(0).nameHash = fileGroup.nameHash;
                } else {
                    for(const [ , childFile ] of fileGroup.files) {
                        const nameHash = buffer.get('int');
                        if(childFile) {
                            childFile.nameHash = nameHash;
                        }
                    }
                }
            }
        }
    }

    public async decompressArchive(options?: DecompressionOptions): Promise<void> {
        const decompressor = new ArchiveDecompressor(this);
        await decompressor.decompressArchive(options);
    }

    /**
     * Adds a new or replaces an existing group within the archive.
     * @param fileIndex The index of the group to add or change.
     * @param group The group to add or change.
     */
    public setGroup(fileIndex: number | string, group: ClientFileGroup): void {
        this.groups.set(typeof fileIndex === 'number' ? String(fileIndex) : fileIndex, group);
    }

    /**
     * Fetches a group from this archive by index.
     * @param fileIndex The index of the group to find.
     */
    public getGroup(fileIndex: number | string): ClientFileGroup {
        return this.groups.get(typeof fileIndex === 'number' ? String(fileIndex) : fileIndex);
    }

    public get name(): string {
        return getIndexName(this.archiveIndex) as string;
    }

}
