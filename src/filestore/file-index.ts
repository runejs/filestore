import { logger } from '@runejs/core';

import { Archive } from './archive';
import { FileData } from './file-data';
import { FilestoreChannels, readIndexedDataChunk, decompress } from './data';
import { hash } from './util';


const NAME_FLAG = 0x01;
const WHIRLPOOL_FLAG = 0x02;

/**
 * String representations of numeric index ids.
 */
export type IndexId = 'configs' | 'sprites' | 'music' | 'jingles' | 'sounds' | 'binary' |
    'widgets' | 'regions' | 'models' | 'textures' | 'scripts' | 'frames' | 'skeletons';

/**
 * A map of unique index keys to numeric ids.
 */
export const indexIdMap: { [key: string]: number } = {
    'skeletons': 0,
    'frames': 1,
    'configs': 2,
    'widgets': 3,
    'sounds': 4,
    'regions': 5,
    'music': 6,
    'models': 7,
    'sprites': 8,
    'textures': 9,
    'binary': 10,
    'jingles': 11,
    'scripts': 12
};

/**
 * Finds the corresponding string index key for the given numeric id.
 * @param index The numeric index id to find the name of.
 */
export const getIndexId = (index: number): IndexId => {
    const ids: string[] = Object.keys(indexIdMap);
    for(const id of ids) {
        if(indexIdMap[id] === index) {
            return id as IndexId;
        }
    }

    return null;
};


export class FileIndex {

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
    public files: Map<number, Archive | FileData> = new Map<number, Archive | FileData>();

    private readonly filestoreChannels: FilestoreChannels;

    /**
     * Creates a new File Index with the specified index ID and filestore channel.
     * @param indexId The ID of this File Index.
     * @param filestoreChannels The main filestore channel for data access.
     */
    public constructor(indexId: number, filestoreChannels: FilestoreChannels) {
        this.indexId = indexId;
        this.filestoreChannels = filestoreChannels;
    }

    /**
     * Fetches a single file from this index.
     * @param fileId The ID of the file to fetch.
     * @returns The requested FileData object, or null if no matching file was found.
     */
    public getFile(fileId: number): FileData | null;

    /**
     * Fetches a single file from this index.
     * @param fileName The name of the file to fetch.
     * @returns The requested FileData object, or null if no matching file was found.
     */
    public getFile(fileName: string): FileData | null;

    /**
     * Fetches a single file from this index.
     * @param fileIdOrName The ID or name of the file to fetch.
     * @param keys The XTEA keys.
     * @returns The requested FileData object, or null if no matching file was found.
     */
    public getFile(fileIdOrName: number | string, keys?: number[]): FileData | null;
    public getFile(fileIdOrName: number | string, keys?: number[]): FileData | null {
        let fileData: FileData;

        if(typeof fileIdOrName === 'string') {
            fileData = this.findByName(fileIdOrName) as FileData;
        } else {
            const archiveId = fileIdOrName as number;
            fileData = this.files.get(archiveId) as FileData;
        }

        if(!fileData) {
            return null;
        }

        if(fileData.type === 'archive') {
            logger.error(fileData);
            throw new Error(`Requested item ${fileIdOrName} in index ${this.indexId} is of type Archive, not FileData.`);
        }

        try {
            fileData.decompress(keys);
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
    public getArchive(archiveId: number): Archive | null;

    /**
     * Fetches an archive from this index.
     * @param archiveName The name of the archive to fetch.
     * @returns The requested Archive object, or null if no Archive was found.
     */
    public getArchive(archiveName: string): Archive | null;

    /**
     * Fetches an archive from this index.
     * @param archiveIdOrName The ID or name of the archive to fetch.
     * @returns The requested Archive object, or null if no Archive was found.
     */
    public getArchive(archiveIdOrName: number | string): Archive | null;
    public getArchive(archiveIdOrName: number | string): Archive | null {
        let archive: Archive;

        if(typeof archiveIdOrName === 'string') {
            archive = this.findByName(archiveIdOrName) as Archive;
        } else {
            const archiveId = archiveIdOrName as number;
            archive = this.files.get(archiveId) as Archive;
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
    public findByName(fileName: string): Archive | FileData | null {
        const indexFileCount = this.files.size;
        const nameHash = hash(fileName);
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
        const indexEntry = readIndexedDataChunk(this.indexId, 255, this.filestoreChannels);
        const { compression, version, buffer } = decompress(indexEntry.dataFile);

        this.version = version;
        this.compression = compression;

        /* file header */
        this.format = buffer.get('BYTE', 'UNSIGNED');
        if(this.format >= 6) {
            this.version = buffer.get('INT');
        }
        this.settings = buffer.get('BYTE', 'UNSIGNED');

        /* file ids */
        const fileCount = buffer.get('SHORT', 'UNSIGNED');
        const ids: number[] = new Array(fileCount);
        let accumulator = 0;
        let size = -1;
        for(let i = 0; i < ids.length; i++) {
            let delta = buffer.get('SHORT', 'UNSIGNED');
            ids[i] = accumulator += delta;
            if(ids[i] > size) {
                size = ids[i];
            }
        }

        size++;

        for(const id of ids) {
            this.files.set(id, new FileData(id, this, this.filestoreChannels));
        }

        /* read the name hashes if present */
        if((this.settings & NAME_FLAG) !== 0) {
            for(const id of ids) {
                const nameHash = buffer.get('INT');
                this.files.get(id).nameHash = nameHash;
            }
        }

        /* read the crc values */
        for(const id of ids) {
            this.files.get(id).crc = buffer.get('INT');
        }

        /* read the whirlpool values */
        if((this.settings & WHIRLPOOL_FLAG) !== 0) {
            for(const id of ids) {
                buffer.copy(this.files.get(id).whirlpool, 0,
                    buffer.readerIndex, buffer.readerIndex + 64);
                buffer.readerIndex = (buffer.readerIndex + 64);
            }
        }

        /* read the version numbers */
        for(const id of ids) {
            this.files.get(id).version = buffer.get('INT');
        }

        /* read the child sizes */
        const members: number[][] = new Array(size).fill([]);
        for(const id of ids) {
            members[id] = new Array(buffer.get('SHORT', 'UNSIGNED'));
        }

        /* read the child ids */
        for(const id of ids) {
            accumulator = 0;
            size = -1;

            for(let i = 0; i < members[id].length; i++) {
                let delta = buffer.get('SHORT', 'UNSIGNED');
                members[id][i] = accumulator += delta;
                if(members[id][i] > size) {
                    size = members[id][i];
                }
            }

            size++;

            /* allocate specific entries within the array */
            const file = this.files.get(id);
            if(members[id].length > 1) {
                if(file.type === 'file') {
                    this.files.set(id, new Archive(file, this, this.filestoreChannels));
                }

                const archive = this.files.get(id) as Archive;

                for(const childId of members[id]) {
                    archive.files.set(childId, new FileData(childId, this, this.filestoreChannels));
                }
            }
        }

        /* read the child name hashes */
        if((this.settings & NAME_FLAG) !== 0) {
            for(const id of ids) {
                const archive = this.files.get(id) as Archive;
                for(const childId of members[id]) {
                    const nameHash = buffer.get('INT');
                    if(archive?.files?.get(childId)) {
                        archive.files.get(childId).nameHash = nameHash;
                    }
                }
            }
        }
    }

}
