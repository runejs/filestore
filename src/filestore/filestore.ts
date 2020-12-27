import { FilestoreChannels, loadFilestore } from './data/filestore-loader';
import { FileIndex, IndexId, indexIdMap } from './file-index';
import { SpriteStore } from './stores/sprite-store';
import { getFileNames } from './util/name-hash';
import { MusicStore } from './stores/music-store';
import { BinaryStore } from './stores/binary-store';
import { JingleStore } from './stores/jingle-store';
import { SoundStore } from './stores/sound-store';
import { RegionStore } from './stores/region-store';
import { ConfigStore } from './stores/config-store';


export let fileNames: { [ key: string ]: string | null };

export const getFileName = (nameHash: number): string | null => {
    return fileNames[nameHash.toString()] || nameHash.toString();
};


export class Filestore {

    public readonly filestoreDir: string;
    public readonly configDir: string;

    public readonly binaryStore: BinaryStore;
    public readonly spriteStore: SpriteStore;
    public readonly midiStore: MusicStore;
    public readonly oggStore: JingleStore;
    public readonly soundStore: SoundStore;
    public readonly regionStore: RegionStore;
    public readonly configStore: ConfigStore;

    private readonly channels: FilestoreChannels;

    private readonly indexes = new Map<number, FileIndex>();

    public constructor(filestoreDir: string, configDir?: string) {
        this.filestoreDir = filestoreDir;
        this.configDir = configDir || filestoreDir;
        this.channels = loadFilestore(filestoreDir);

        if(configDir) {
            fileNames = getFileNames(configDir);
        }
        this.binaryStore = new BinaryStore(this);
        this.spriteStore = new SpriteStore(this);
        this.midiStore = new MusicStore(this);
        this.oggStore = new JingleStore(this);
        this.soundStore = new SoundStore(this);
        this.regionStore = new RegionStore(this);
        this.configStore = new ConfigStore(this);
    }

    /**
     * Fetches the specified File Index.
     * @param indexId The string or numberic ID of the File Index to find.
     */
    public getIndex(indexId: number | IndexId): FileIndex {
        if(typeof indexId !== 'number') {
            indexId = indexIdMap[indexId];
        }

        if(!this.indexes.has(indexId)) {
            const archiveIndex = new FileIndex(indexId, this.channels);
            archiveIndex.decodeIndex();
            this.indexes.set(indexId, archiveIndex);
            return archiveIndex;
        } else {
            return this.indexes.get(indexId);
        }
    }

}
