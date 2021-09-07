import { StoreFileBase } from '@runejs/js5';
import { FlatFileStore } from './flat-file-store';
import { Group } from './group';
import { Archive } from './archive';


export class File extends StoreFileBase {

    public readonly store: FlatFileStore;
    public readonly group: Group;
    public readonly archive: Archive;

    public constructor(index: string, group: Group) {
        super(index);
        this.group = group;
        this.archive = group.archive;
        this.store = group.store;
    }

}
