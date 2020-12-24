import { Filestore } from '../filestore';
import { ItemStore } from './configs/item-store';
import { Archive } from '../archive';


export class ConfigStore {

    public readonly items: ItemStore;
    private readonly fileStore: Filestore;

    public constructor(fileStore: Filestore) {
        this.fileStore = fileStore;
        this.items = new ItemStore(this);
    }

    public getItemArchive(): Archive | null {
        return this.fileStore.getIndex('configs')?.getArchive(10) || null;
    }

}
