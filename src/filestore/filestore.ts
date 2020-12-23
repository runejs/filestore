import { FilestoreChannels, loadFilestore } from './data/filestore-loader';
import { FileIndex, IndexId, indexIdMap } from './file-index';
import { SpriteStore } from './stores/sprite-store';
import { getFileNames } from './util/name-hash';
import { MidiStore } from './stores/midi-store';
import { BinaryStore } from './stores/binary-store';
import { OggStore } from './stores/ogg-store';


export let fileNames: { [ key: string ]: string | null };

export const getFileName = (nameHash: number): string | null => {
    return fileNames[nameHash.toString()] || nameHash.toString();
};


export class Filestore {

    public readonly filestoreDir: string;
    public readonly configDir: string;
    public readonly binaryStore = new BinaryStore(this);
    public readonly spriteStore = new SpriteStore(this);
    public readonly midiStore = new MidiStore(this);
    public readonly oggStore = new OggStore(this);
    private readonly channels: FilestoreChannels;
    private readonly indexes = new Map<number, FileIndex>();

    public constructor(filestoreDir: string, configDir?: string) {
        this.filestoreDir = filestoreDir;
        this.configDir = configDir;
        this.channels = loadFilestore(filestoreDir);

        if(configDir) {
            fileNames = getFileNames(configDir);
        }
    }

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

    public getSpriteIndex(): FileIndex {
        return this.getIndex(5);
    }

    public getBinaryIndex(): FileIndex {
        return this.getIndex(10);
    }

}
