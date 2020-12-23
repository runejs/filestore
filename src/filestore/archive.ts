import { ByteBuffer } from '@runejs/core';
import { FileData } from './file-data';
import { FileIndex } from './file-index';
import { FilestoreChannels } from './data/filestore-loader';
import { readIndexedDataChunk } from './data/chunk-parser';
import { decompress } from './data/compression';


export class Archive extends FileData {

    public files: Map<number, FileData>;
    public type: 'archive' | 'file' = 'archive';

    public constructor(id: number, index: FileIndex, filestoreChannels: FilestoreChannels);
    public constructor(fileData: FileData, index: FileIndex, filestoreChannels: FilestoreChannels);
    public constructor(idOrFileData: number | FileData, index: FileIndex, filestoreChannels: FilestoreChannels) {
        super(typeof idOrFileData === 'number' ? idOrFileData : idOrFileData.fileId, index, filestoreChannels);

        if(typeof idOrFileData !== 'number') {
            const fileData = idOrFileData as FileData;
            const { content, nameHash, crc, whirlpool, version, compression } = fileData;
            this.content = content;
            this.nameHash = nameHash;
            this.crc = crc;
            this.whirlpool = whirlpool;
            this.version = version;
            this.compression = compression;
        }

        this.files = new Map<number, FileData>();
    }

    public getFile(fileId: number): FileData {
        return this.files.get(fileId);
    }

    public decodeArchiveFiles(): void {
        const archiveEntry = readIndexedDataChunk(this.fileId, this.index.indexId, this.filestoreChannels);
        const  { compression, version, buffer } = decompress(archiveEntry.dataFile);
        const archiveSize = this.index.files.size;

        this.content = buffer;

        this.version = version;
        this.content = buffer;
        this.compression = compression;
        this.files.clear();
        buffer.readerIndex = (buffer.length - 1);
        const chunkCount = buffer.get('BYTE', 'UNSIGNED');

        const chunkSizes: number[][] = new Array(chunkCount).fill(new Array(archiveSize));
        const sizes: number[] = new Array(archiveSize).fill(0);
        buffer.readerIndex = (buffer.length - 1 - chunkCount * archiveSize * 4);
        for(let chunk = 0; chunk < chunkCount; chunk++) {
            let chunkSize = 0;
            for(let id = 0; id < archiveSize; id++) {
                const delta = buffer.get('INT');
                chunkSize += delta;

                chunkSizes[chunk][id] = chunkSize;
                sizes[id] += chunkSize;
            }
        }

        for(let id = 0; id < archiveSize; id++) {
            const fileData = new FileData(id, this.index, this.filestoreChannels);
            fileData.content = new ByteBuffer(sizes[id]);
            this.files.set(id, fileData);
        }

        buffer.readerIndex = 0;

        for(let chunk = 0; chunk < chunkCount; chunk++) {
            for(let id = 0; id < archiveSize; id++) {
                const chunkSize = chunkSizes[chunk][id];
                this.files.get(id).content.putBytes(buffer.getSlice(buffer.readerIndex, chunkSize));
                buffer.copy(this.files.get(id).content, 0, buffer.readerIndex, buffer.readerIndex + chunkSize);
                buffer.readerIndex = (buffer.readerIndex + chunkSize);
            }
        }
    }

}
