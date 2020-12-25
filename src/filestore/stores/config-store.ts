import { Filestore } from '../filestore';
import { ItemStore } from './configs/item-store';
import { Archive } from '../archive';
import { FileIndex } from '../file-index';


export class ConfigStore {

    public readonly items: ItemStore;
    public readonly itemArchive: Archive;
    public readonly configIndex: FileIndex;
    private readonly fileStore: Filestore;

    public constructor(fileStore: Filestore) {
        this.fileStore = fileStore;
        this.configIndex = fileStore.getIndex('configs');
        this.itemArchive = this.configIndex.getArchive(10);
        this.items = new ItemStore(this);
    }

}
