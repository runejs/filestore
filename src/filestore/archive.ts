import { ByteBuffer } from '@runejs/core';
import { FileData } from './file-data';
import { ArchiveIndex } from './archive-index';
import { CacheChannel } from './data/channels';
import { readIndexEntry } from './data/parser';
import { decompress } from './data/compression';


export class Archive extends FileData {

    public readonly index: ArchiveIndex;
    public crc: number;
    public whirlpool: ByteBuffer = new ByteBuffer(64);
    public version: number;
    public compression: number;
    public files: Map<number, FileData>;
    private readonly cacheChannel: CacheChannel;

    public constructor(id: number, index: ArchiveIndex, cacheChannel: CacheChannel) {
        super(id);
        this.index = index;
        this.cacheChannel = cacheChannel;
        this.files = new Map<number, FileData>();
    }

    public getFile(fileId: number): FileData {
        return this.files.get(fileId);
    }

    public decompress(): void {
        const archiveEntry = readIndexEntry(this.fileId, this.index.indexId, this.cacheChannel);
        const { buffer } = decompress(archiveEntry.dataFile);
        this.content = buffer;
    }

    public decodeArchive(): void {
        const archiveEntry = readIndexEntry(this.fileId, this.index.indexId, this.cacheChannel);
        const  { compression, version, buffer } = decompress(archiveEntry.dataFile);
        const archiveSize = this.index.archives.size;

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
            this.files.set(id, new FileData(id, null, new ByteBuffer(sizes[id])));
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
