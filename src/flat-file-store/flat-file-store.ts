import { Archive } from './archive';
import { StoreConfig } from '@runejs/js5';
import { join } from 'path';
import { ByteBuffer } from '@runejs/common/buffer';
import { Crc32 } from '@runejs/js5/lib/crc32';


export interface FlatFileStoreOptions {
    storePath: string;
    gameVersion?: number;
}


export class FlatFileStore {

    public readonly storePath: string;
    public readonly gameVersion: number | undefined;
    public readonly archives: Map<string, Archive>;

    private _mainIndexData: ByteBuffer;

    public constructor(options: FlatFileStoreOptions) {
        if(!options?.storePath) {
            throw new Error(`Flat file store path not found. Please include 'storePath' in your flat file store options.`);
        }

        this.storePath = options.storePath;
        this.gameVersion = options.gameVersion;
        this.archives = new Map<string, Archive>();
        StoreConfig.register(options.storePath, options.gameVersion);
        Crc32.generateCrcLookupTable();
        StoreConfig.loadArchiveConfig();
    }

    public buildMainIndex(): void {
        const archives = this.getAllArchives();
        const archiveCount = archives.size;

        const dataLength = (4 * archiveCount) + 5;
        const data = new ByteBuffer(4096);

        data.put(0);
        data.put(4 * archiveCount, 'int');

        for(let archiveIndex = 0; archiveIndex < archiveCount; archiveIndex++) {
            const archive = archives.get(String(archiveIndex));
            data.put(archive.crc32, 'int');
        }

        this._mainIndexData = data;
    }

    public getArchive(archiveId: string): Archive {
        const archiveIndex = StoreConfig.getArchiveIndex(archiveId) ?? archiveId;
        if(!this.archives.has(archiveIndex)) {
            this.createArchive(archiveIndex);
        }

        return this.archives.get(archiveIndex);
    }

    public getAllArchives(): Map<string, Archive> {
        if(!this.loaded) {
            for(const [ archiveIndex, ] of StoreConfig.archives) {
                if(archiveIndex !== '255' && !this.archives.has(archiveIndex)) {
                    this.createArchive(archiveIndex);
                }
            }
        }

        return this.archives;
    }

    public async readStore(compress: boolean = false): Promise<void> {
        if(!this.loaded) {
            this.getAllArchives();
        }

        for(const [ , archive ] of this.archives) {
            await archive.readFiles(compress);
        }
    }

    public createArchive(archiveIndex: string | number): void {
        this.archives.set(String(archiveIndex), new Archive(archiveIndex, this));
    }

    public get mainIndexData(): ByteBuffer {
        return this._mainIndexData;
    }

    public get loaded(): boolean {
        return this.archives.size === StoreConfig.archives.size - 1;
    }

    public get outputPath(): string {
        return join(this.storePath, 'output');
    }

}
