import { ClientFileStore } from '../client-file-store';
import { ClientFileGroup } from '../client-file-group';
import { NpcStore, ObjectStore, ItemStore, VarbitStore } from './configs';
import { Store } from './store';
import { FileGroup, FileStore, IndexedFile } from '../../file-store';


/**
 * String representations of config file/archive ids.
 */
export type ConfigId =
    'character' |
    'objects' |
    'npcs' |
    'items' |
    'animations' |
    'graphics' |
    'varbits';

/**
 * A map of unique config keys to file/archive ids within the config store.
 */
export const configIdMap: { [key: string]: number } = {
    'character': 3,
    'objects': 6,
    'npcs': 9,
    'items': 10,
    'animations': 12,
    'graphics': 13,
    'varbits': 14
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
export class ConfigStore extends Store {

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
     * A Store used to access the Varbit Archive, containing details about every game varbit.
     */
    public readonly varbitStore: VarbitStore;

    public constructor(clientFileStore: ClientFileStore);
    public constructor(flatFileStore: FileStore);
    public constructor(fileStore: ClientFileStore | FileStore) {
        super(fileStore, 'config');
        this.itemStore = new ItemStore(this);
        this.npcStore = new NpcStore(this);
        this.objectStore = new ObjectStore(this);
        this.varbitStore = new VarbitStore(this);
    }

    public getGroup(configId: ConfigId | number): ClientFileGroup | FileGroup {
        if(typeof configId !== 'number') {
            configId = configIdMap[configId];
        }

        if(this.flatFileStore) {
            return this.indexedArchive.files.get(configId) as FileGroup;
        }

        return this.clientArchive.groups.get(configId);
    }

}
