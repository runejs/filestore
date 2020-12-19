import { readIndexEntry } from './data/parser';
import { Archive } from './archive';
import { FileData } from './file-data';
import { CacheChannel } from './data/channels';
import { decompress } from './data/compression';


const flagName = 0x01;
const flagWhirlpool = 0x02;

export type IndexId = 'sprites' | 'midi';

export const indexIdMap: { [key: string]: number } = {
    'midi': 6,
    'sprites': 8
};

export class ArchiveIndex {

    public readonly indexId: number;
    public format: number;
    public version: number;
    public compression: number;
    public flags: number;
    public archives: Map<number, Archive> = new Map<number, Archive>();
    private readonly cacheChannel: CacheChannel;

    public constructor(indexId: number, cacheChannel: CacheChannel) {
        this.indexId = indexId;
        this.cacheChannel = cacheChannel;
    }

    public getArchive(archiveId: number, decode: boolean = true): Archive | null {
        const archive = this.archives.get(archiveId);

        if(!archive) {
            return null;
        }

        if(decode) {
            archive.decodeArchive();
        } else {
            archive.decompress();
        }

        return archive;
    }

    public decodeIndex(): void {
        const indexEntry = readIndexEntry(this.indexId, 255, this.cacheChannel);
        const { compression, version, buffer } = decompress(indexEntry.dataFile);

        this.version = version;
        this.compression = compression;

        /* read header */
        this.format = buffer.get('BYTE', 'UNSIGNED');
        if(this.format >= 6) {
            this.version = buffer.get('INT');
        }
        this.flags = buffer.get('BYTE', 'UNSIGNED');

        /* read the ids */
        const ids: number[] = new Array(buffer.get('SHORT', 'UNSIGNED'));
        let accumulator = 0, size = -1;
        for(let i = 0; i < ids.length; i++) {
            let delta = buffer.get('SHORT', 'UNSIGNED');
            ids[i] = accumulator += delta;
            if(ids[i] > size) {
                size = ids[i];
            }
        }
        size++;

        for(const id of ids) {
            this.archives.set(id, new Archive(id, this, this.cacheChannel));
        }

        /* read the name hashes if present */
        if((this.flags & flagName) != 0) {
            for(const id of ids) {
                this.archives.get(id).nameHash = buffer.get('INT');
            }
        }

        /* read the crc checksums */
        for(const id of ids) {
            this.archives.get(id).crc = buffer.get('INT');
        }

        /* read the whirlpool digests */
        if((this.flags & flagWhirlpool) != 0) {
            for(const id of ids) {
                buffer.copy(this.archives.get(id).whirlpool, 0,
                    buffer.readerIndex, buffer.readerIndex + 64);
                buffer.readerIndex = (buffer.readerIndex + 64);
            }
        }

        /* read the version numbers */
        for(const id of ids) {
            this.archives.get(id).version = buffer.get('INT');
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
            for(const childId of members[id]) {
                this.archives.get(id).files.set(childId, new FileData(childId, null));
            }
        }

        /* read the child name hashes */
        if((this.flags & flagName) != 0) {
            for(const id of ids) {
                for(const childId of members[id]) {
                    this.archives.get(id).files.get(childId).nameHash = buffer.get('INT');
                }
            }
        }
    }

}
