import { Js5FileStore } from './js5-file-store';
import { Js5Archive } from './js5-archive';
import { JS5Group } from './js5-group';
import { Js5FileBase } from './js5-file-base';


export class JS5File extends Js5FileBase {

    readonly archive: Js5Archive;
    readonly group: JS5Group;

    constructor(
        fileStore: Js5FileStore,
        fileKey: number,
        group: JS5Group,
    ) {
        super(fileStore, 'FILE', fileKey, group.archive.index.key, group.index.key);
        this.archive = group.archive;
        this.group = group;
    }

}
