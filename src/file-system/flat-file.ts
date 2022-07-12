import { FileBase } from './file-base';
import { FileStore } from './file-store';
import { FileType } from '../config/file-type';
import { Archive } from './archive';
import { Group } from './group';


export class FlatFile extends FileBase {

    readonly archive: Archive;
    readonly group: Group;

    constructor(
        fileStore: FileStore,
        key: number,
        group: Group,
    ) {
        super(fileStore, key, group.index.key, 'FILE');
        this.archive = group.archive;
        this.group = group;
    }

}
