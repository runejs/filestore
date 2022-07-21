import { JagArchive } from './jag-archive';
import { FileStoreBase } from '../file-store-base';
import { Jag } from './jag';


export class JagStore extends FileStoreBase<JagArchive> {

    readonly jag: Jag;

    constructor(gameBuild: string | number, storePath: string = './') {
        super(gameBuild, storePath, 'jag-cache-archives');
        this.jag = new Jag(this);
    }

    override async load(): Promise<void> {
        await this.openDatabase();
    }

    createArchive(archiveKey: number): void {
        this.setArchive(archiveKey, new JagArchive(this, archiveKey));
    }

}
