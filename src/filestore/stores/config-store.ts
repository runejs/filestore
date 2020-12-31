import { Filestore } from '../filestore';
import { ItemStore } from './configs/item-store';
import { FileIndex } from '../file-index';
import { Archive } from '../archive';


export type ConfigId = 'objects' | 'npcs' | 'items';

export const configIdMap: { [key: string]: number } = {
    'objects': 6,
    'npcs': 9,
    'items': 10
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
     * The configuration file/archive index.
     */
    public readonly configIndex: FileIndex;

    public constructor(private fileStore: Filestore) {
        this.configIndex = fileStore.getIndex('configs');
        this.itemStore = new ItemStore(this);
    }

    public getArchive(configId: ConfigId | number): Archive {
        if(typeof configId !== 'number') {
            configId = configIdMap[configId];
        }

        return this.configIndex.getArchive(configId);
    }

}
