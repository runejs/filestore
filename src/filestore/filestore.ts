import { FilestoreChannels, loadFilestore } from './data/filestore-loader';
import { FileIndex, IndexId, indexIdMap } from './file-index';
import { SpriteStore } from './stores/sprite-store';
import { getFileNames } from './util/name-hash';
import { MidiStore } from './stores/midi-store';
import { BinaryStore } from './stores/binary-store';
import { OggStore } from './stores/ogg-store';
import { SoundStore } from './stores/sound-store';
import { RegionStore } from './stores/region-store';


export let fileNames: { [ key: string ]: string | null };

export const getFileName = (nameHash: number): string | null => {
    return fileNames[nameHash.toString()] || nameHash.toString();
};


export class Filestore {

    public readonly filestoreDir: string;
    public readonly configDir: string;
    
    public readonly binaryStore: BinaryStore;
    public readonly spriteStore: SpriteStore;
    public readonly midiStore: MidiStore;
    public readonly oggStore: OggStore;
    public readonly soundStore: SoundStore;
    public readonly regionStore: RegionStore;

    private readonly channels: FilestoreChannels;

    private readonly indexes = new Map<number, FileIndex>();

    public constructor(filestoreDir: string, configDir?: string) {
        this.filestoreDir = filestoreDir;
        this.configDir = configDir;
        this.channels = loadFilestore(filestoreDir);

        if(configDir) {
            fileNames = getFileNames(configDir);
        }
        this.binaryStore = new BinaryStore(this);
        this.spriteStore = new SpriteStore(this);
        this.midiStore = new MidiStore(this);
        this.oggStore = new OggStore(this);
        this.soundStore = new SoundStore(this);
        this.regionStore = new RegionStore(this);
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
