import { Filestore } from '../filestore';
import { ItemStore } from './configs/item-store';
import { FileIndex } from '../file-index';
import { Archive } from '../archive';
import { ObjectStore } from './configs/object-store';
import { NpcStore } from './configs/npc-store';


/**
 * String representations of config file/archive ids.
 */
export type ConfigId =
    'character' |
    'objects' |
    'npcs' |
    'items' |
    'animations' |
    'graphics';

/**
 * A map of unique config keys to file/archive ids within the config store.
 */
export const configIdMap: { [key: string]: number } = {
    'character': 3,
    'objects': 6,
    'npcs': 9,
    'items': 10,
    'animations': 12,
    'graphics': 13
};

/**
 * Finds the corresponding string config key for the given numeric id.
 * @param config The numeric config file/archive id to find the name of.
 */
export const getConfigId = (config: number): ConfigId => {
    const ids: string[] = Object.keys(configIdMap);
    for(const id of ids) {
        if(configIdMap[id] === config) {
            return id as ConfigId;
        }
    }

    return null;
};


/**
 * Contains various configuration related Archives.
 */
export class ConfigStore {

    /**
     * A Store used to access the Item Archive, containing details about every game item.
     */
    public readonly itemStore: ItemStore;

    /**
     * A Store used to access the Npc Archive, containing details about every game npc.
     */
    public readonly npcStore: NpcStore;

    /**
     * A Store used to access the Object Archive, containing details about every game object.
     */
    public readonly objectStore: ObjectStore;

    /**
     * The configuration file/archive index.
     */
    public readonly configIndex: FileIndex;

    public constructor(private fileStore: Filestore) {
        this.configIndex = fileStore.getIndex('configs');
        this.itemStore = new ItemStore(this);
        this.npcStore = new NpcStore(this);
        this.objectStore = new ObjectStore(this);
    }

    public getArchive(configId: ConfigId | number): Archive {
        if(typeof configId !== 'number') {
            configId = configIdMap[configId];
        }

        return this.configIndex.getArchive(configId);
    }

}
