import { JS5ArchiveConfig } from '../../config';
import { JS5 } from './js5';
import { Archive } from './archive';
import { FileStoreBase } from '../file-store-base';


export class JS5FileStore extends FileStoreBase<Archive, JS5ArchiveConfig>{

    readonly vanillaBuild: boolean;
    readonly js5: JS5;

    constructor(gameBuild: string | number, storePath: string = './') {
        super(gameBuild, storePath, 'js5-archives');
        // @todo make `vanillaBuild` obsolete via auto-detection - 07/13/22 - Kiko
        this.vanillaBuild = typeof gameBuild === 'number';
        this.js5 = new JS5(this);
    }

    override async load(): Promise<void> {
        await this.js5.loadEncryptionKeys();
        await this.openDatabase();

        const archiveNames = Object.keys(this.archiveConfig);

        for (const archiveName of archiveNames) {
            const archiveConfig = this.archiveConfig[archiveName];

            if (archiveConfig.key === 255) {
                continue;
            }

            if (this.vanillaBuild && archiveConfig.build) {
                const buildNumber = Number(this.gameBuild);

                if (buildNumber < archiveConfig.build) {
                    continue;
                }
            }

            if (!this.archives.has(archiveConfig.key)) {
                const archive = new Archive(
                    this,
                    archiveConfig.key,
                    archiveName,
                );
                this.archives.set(archiveConfig.key, archive);
            }
        }
    }

}
