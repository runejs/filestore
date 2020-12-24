import { Filestore } from '../filestore';
import { ItemStore } from './configs/item-store';


export class ConfigStore {

    public readonly items: ItemStore;
    private readonly fileStore: Filestore;

    public constructor(fileStore: Filestore) {
        this.fileStore = fileStore;
        this.items = new ItemStore(this);
    }

}
