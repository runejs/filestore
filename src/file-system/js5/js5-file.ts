import { Js5FileStore } from './js5-file-store';
import { Js5Archive } from './js5-archive';
import { Js5Group } from './js5-group';
import { Js5FileBase } from './js5-file-base';


export class Js5File extends Js5FileBase {

    readonly archive: Js5Archive;
    readonly group: Js5Group;

    constructor(
        fileStore: Js5FileStore,
        fileKey: number,
        group: Js5Group,
    ) {
        super(fileStore, 'FILE', fileKey, group.archive.index.key, group.index.key);
        this.archive = group.archive;
        this.group = group;
    }

}
