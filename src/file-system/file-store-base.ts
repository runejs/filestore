import { Djb2 } from '../config';
import { IndexDatabase } from '../db/index-database';
import { join } from 'path';
import { Crc32 } from '@runejs/common/crc32';
import { existsSync, readFileSync } from 'graceful-fs';
import { logger } from '@runejs/common';
import JSON5 from 'json5';
import { IndexedFileBase } from './indexed-file-base';


export abstract class FileStoreBase<A extends IndexedFileBase<any>, C> {

    readonly gameBuild: string;
    readonly fileStorePath: string;
    readonly archiveConfigFileName: string;
    readonly archives: Map<number, A>;
    readonly djb2: Djb2;

    private _archiveConfig: { [key: string]: C };
    private _database: IndexDatabase;

    protected constructor(gameBuild: string | number, storePath: string, archiveConfigFileName: string) {
        this.gameBuild = String(gameBuild);
        this.archiveConfigFileName = archiveConfigFileName;
        this.fileStorePath = storePath;
        this.archives = new Map<number, A>();
        this.loadArchiveConfig();
        this.djb2 = new Djb2(join(storePath, 'config'));
        Crc32.init();
    }

    abstract load(): void | Promise<void>;

    async loadArchiveIndexes(): Promise<void> {
        for (const [ , archive ] of this.archives) {
            await archive.loadIndex();
        }
    }

    loadArchiveConfig(): void {
        const configPath = join(this.fileStorePath, 'config', this.archiveConfigFileName + '.json5');

        if (!existsSync(configPath)) {
            logger.error(`Error loading file store: ${configPath} was not found.`);
            return;
        }

        this._archiveConfig = JSON5.parse(
            readFileSync(configPath, 'utf-8')
        ) as { [key: string]: C };

        if (!Object.values(this._archiveConfig)?.length) {
            throw new Error(`Error reading archive configuration file. ` +
                `Please ensure that the ${configPath} file exists and is valid.`);
        }
    }

    async openDatabase(): Promise<IndexDatabase> {
        this._database = new IndexDatabase(
            this.gameBuild,
            join(this.fileStorePath, 'index'),
            [ 'error', 'warn' ],
        );
        await this._database.openConnection();
        return this._database;
    }

    getArchive(archiveKey: number): A | null {
        return this.archives.get(archiveKey) || null;
    }

    setArchive(archiveKey: number, archive: A): void {
        this.archives.set(archiveKey, archive);
    }

    findArchive(archiveName: string): A | null {
        return Array.from(this.archives.values()).find(
            a => a?.index?.name === archiveName
        ) || null;
    }

    get archiveConfig(): { [key: string]: C } {
        return this._archiveConfig;
    }

    get database(): IndexDatabase {
        return this._database;
    }

}
