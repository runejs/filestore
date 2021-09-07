import { Archive } from './archive';
import { StoreConfig } from '@runejs/js5';


export interface FlatFileStoreOptions {
    storePath: string;
    configPath: string;
    outputPath?: string;
    gameVersion?: number;
}


export class FlatFileStore {

    public readonly storePath: string;
    public readonly configPath: string;
    public readonly outputPath: string | undefined;
    public readonly gameVersion: number | undefined;
    public readonly archives: Map<string, Archive>;

    public constructor(options: FlatFileStoreOptions) {
        if(!options?.storePath) {
            throw new Error(`Flat file store path not found. Please include 'storePath' in your flat file store options.`);
        }
        if(!options?.configPath) {
            throw new Error(`Flat file store config path not found. Please include 'configPath' in your flat file store options.`);
        }

        this.storePath = options.storePath;
        this.configPath = options.configPath;
        this.gameVersion = options.gameVersion;
        this.outputPath = options.outputPath;
        this.archives = new Map<string, Archive>();
        StoreConfig.register(options.configPath, options.gameVersion);
        StoreConfig.loadArchiveConfig();
    }

    public getArchive(archiveId: string): Archive {
        const archiveIndex = StoreConfig.getArchiveIndex(archiveId) ?? archiveId;

        if(!this.archives.has(archiveIndex)) {
            this.createArchive(archiveId);
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

    public readStore(compress: boolean = false): void {
        if(!this.loaded) {
            this.getAllArchives();
        }

        for(const [ , archive ] of this.archives) {
            archive.readFiles(compress);
        }
    }

    public createArchive(archiveIndex: string | number): void {
        this.archives.set(String(archiveIndex), new Archive(archiveIndex, this));
    }

    public get loaded(): boolean {
        return this.archives.size === StoreConfig.archives.size - 1;
    }

}
