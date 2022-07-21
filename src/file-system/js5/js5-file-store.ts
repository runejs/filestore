import { JS5ArchiveConfig } from '../../config';
import { JS5 } from './js5';
import { JS5Archive } from './js5-archive';
import { FileStoreBase } from '../file-store-base';


export class JS5FileStore extends FileStoreBase<JS5Archive, JS5ArchiveConfig>{

    readonly js5: JS5;

    constructor(gameBuild: string | number, storePath: string = './') {
        super(gameBuild, storePath, 'js5-archives');
        this.js5 = new JS5(this);
    }

    override async load(): Promise<void> {
        await this.js5.loadEncryptionKeys();
        await this.openDatabase();
    }

    createArchive(archiveKey: number): void {
        this.setArchive(archiveKey, new JS5Archive(this, archiveKey));
    }

}
