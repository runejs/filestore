import { readIndexedDataChunk } from './data/chunk-parser';
import { Archive } from './archive';
import { FileData } from './file-data';
import { FilestoreChannels } from './data/filestore-loader';
import { decompress } from './data/compression';
import { hash } from './util/name-hash';
import { logger } from '@runejs/core';


const flagName = 0x01;
const flagWhirlpool = 0x02;

export type IndexId = 'sprites' | 'midi' | 'ogg' | 'sounds' | 'binary' | 'widgets' | 'mapdata' | 'models' | 'textures' | 'scripts';

export const indexIdMap: { [key: string]: number } = {
    'widgets': 3,
    'sounds': 4,
    'mapdata': 5,
    'midi': 6,
    'models': 7,
    'sprites': 8,
    'textures': 9,
    'binary': 10,
    'ogg': 11,
    'scripts': 12
};

export class FileIndex {

    public readonly indexId: number;
    public format: number;
    public version: number;
    public compression: number;
    public flags: number;
    public files: Map<number, Archive | FileData> = new Map<number, Archive | FileData>();
    private readonly filestoreChannels: FilestoreChannels;

    public constructor(indexId: number, cacheChannel: FilestoreChannels) {
        this.indexId = indexId;
        this.filestoreChannels = cacheChannel;
    }

    public getFile(fileId: number): FileData | null;
    public getFile(fileName: string): FileData | null;
    public getFile(fileIdOrName: number | string): FileData | null;
    public getFile(fileIdOrName: number | string): FileData | null {
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

        fileData.decompress();

        return fileData;
    }

    public getArchive(archiveId: number): Archive | null;
    public getArchive(archiveName: string): Archive | null;
    public getArchive(archiveIdOrName: number | string);
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

    public findByName(fileName: string): Archive | FileData {
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
        this.flags = buffer.get('BYTE', 'UNSIGNED');

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
        if((this.flags & flagName) !== 0) {
            for(const id of ids) {
                this.files.get(id).nameHash = buffer.get('INT');
            }
        }

        /* read the crc values */
        for(const id of ids) {
            this.files.get(id).crc = buffer.get('INT');
        }

        /* read the whirlpool values */
        if((this.flags & flagWhirlpool) !== 0) {
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
        if((this.flags & flagName) !== 0) {
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
