import { JS5FileStore } from './js5-file-store';
import { JS5Archive } from './js5-archive';
import { JS5Group } from './js5-group';
import { IndexedFileBase } from '../indexed-file-base';


export class JS5File extends IndexedFileBase<JS5FileStore> {

    readonly archive: JS5Archive;
    readonly group: JS5Group;

    constructor(
        fileStore: JS5FileStore,
        fileKey: number,
        group: JS5Group,
    ) {
        super(fileStore, 'FILE', fileKey, group.archive.index.key, group.index.key);
        this.archive = group.archive;
        this.group = group;
    }

}
