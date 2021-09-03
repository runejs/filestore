import { ClientFileStore } from '../client-file-store';
import { ClientFileGroup } from '../client-file-group';
import { NpcStore, ObjectStore, ItemStore, VarbitStore } from './configs';
import { Store } from './store';
import { FileGroup, FileStore, getGroupNames } from '../../file-store';


/**
 * Finds the corresponding string groupIndex key for the given numeric id.
 * @param groupIndex The numeric groupIndex file/archive id to find the name of.
 */
export const getConfigGroupName = (groupIndex: number): string => {
    const nameMap = getGroupNames('config');
    const names: string[] = Object.keys(nameMap);
    for(const name of names) {
        if(nameMap[name] === groupIndex) {
            return name;
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

    public getGroup(groupIndex: string | number): ClientFileGroup | FileGroup {
        if(this.flatFileStore) {
            return this.indexedArchive.getGroup(groupIndex) as FileGroup;
        }

        return this.clientArchive.getGroup(groupIndex);
    }

}
