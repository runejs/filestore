import { Filestore } from '../filestore';
import { ItemStore } from './configs/item-store';
import { Archive } from '../archive';
import { FileIndex } from '../file-index';


/**
 * Contains various configuration related Archives.
 */
export class ConfigStore {

    /**
     * The Item Archive, containing details about every game item.
     */
    public readonly itemArchive: Archive;

    /**
     * A Store used to access the Item Archive, containing details about every game item.
     */
    public readonly items: ItemStore;

    /**
     * The configuration file/archive index.
     */
    public readonly configIndex: FileIndex;

    public constructor(private fileStore: Filestore) {
        this.configIndex = fileStore.getIndex('configs');
        this.itemArchive = this.configIndex.getArchive(10);
        this.items = new ItemStore(this);
    }

}
