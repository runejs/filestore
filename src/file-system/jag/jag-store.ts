import { JagCacheArchiveConfig } from '../../config';
import { JagArchive } from './jag-archive';
import { FileStoreBase } from '../file-store-base';
import { Jag } from './jag';


export class JagStore extends FileStoreBase<JagArchive, JagCacheArchiveConfig> {

    readonly jag: Jag;

    constructor(gameBuild: string | number, storePath: string = './') {
        super(gameBuild, storePath, 'jag-cache-archives');
        this.jag = new Jag(this);
    }

    override async load(): Promise<void> {
        await this.openDatabase();

        const archiveNames = Object.keys(this.archiveConfig);

        for (const archiveName of archiveNames) {
            const archiveConfig = this.archiveConfig[archiveName];

            if (!this.archives.has(archiveConfig.key)) {
                const archive = new JagArchive(
                    this,
                    archiveConfig.key,
                    archiveName,
                );
                this.archives.set(archiveConfig.key, archive);
            }
        }
    }

}
