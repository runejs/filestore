import { JS5FileStore } from './js5-file-store';
import { Archive } from './archive';
import { Group } from './group';
import { IndexedFileBase } from '../indexed-file-base';


export class FlatFile extends IndexedFileBase<JS5FileStore> {

    readonly archive: Archive;
    readonly group: Group;

    constructor(
        fileStore: JS5FileStore,
        fileKey: number,
        group: Group,
    ) {
        super(fileStore, 'FILE', fileKey, group.archive.index.key, group.index.key);
        this.archive = group.archive;
        this.group = group;
    }

}
