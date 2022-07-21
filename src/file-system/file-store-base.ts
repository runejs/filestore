import JSON5 from 'json5';
import { join } from 'path';
import { existsSync, readFileSync } from 'graceful-fs';
import { Crc32 } from '@runejs/common/crc32';
import { logger } from '@runejs/common';

import { ArchiveConfig, Djb2 } from '../config';
import { IndexDatabase } from '../db/index-database';
import { IndexedFileBase } from './indexed-file-base';


export abstract class FileStoreBase<A extends IndexedFileBase<any>, C extends ArchiveConfig = ArchiveConfig> {

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

    async closeDatabase(): Promise<void> {
        await this._database.closeConnection();
    }

    getArchive(archiveKey: number): A | null;
    getArchive(archiveName: string): A | null;
    getArchive(archiveKeyOrName: number | string): A | null;
    getArchive(archiveKeyOrName: number | string): A | null {
        if (typeof archiveKeyOrName === 'string') {
            return Array.from(this.archives.values()).find(
                a => a?.index?.name === archiveKeyOrName
            ) || null;
        } else {
            return this.archives.get(archiveKeyOrName) || null;
        }
    }

    setArchive(archiveKey: number, archive: A): void;
    setArchive(archiveName: string, archive: A): void;
    setArchive(archiveKeyOrName: number | string, archive: A): void;
    setArchive(archiveKeyOrName: number | string, archive: A): void {
        if (typeof archiveKeyOrName === 'string') {
            const archiveConfig = this.getArchiveConfig(archiveKeyOrName);
            if (archiveConfig) {
                this.archives.set(archiveConfig.key, archive);
            } else {
                logger.error(`Archive ${ archiveKeyOrName } configuration was not found.`);
            }
        } else {
            this.archives.set(archiveKeyOrName, archive);
        }
    }

    getArchiveConfig(archiveKey: number): C | null;
    getArchiveConfig(archiveName: string): C | null;
    getArchiveConfig(archiveKeyOrName: number | string): C | null;
    getArchiveConfig(archiveKeyOrName: number | string): C | null {
        if (typeof archiveKeyOrName === 'string') {
            return this._archiveConfig[archiveKeyOrName] || null;
        } else {
            return Object.values(this._archiveConfig).find(c => c.key === archiveKeyOrName) || null;
        }
    }

    getArchiveName(archiveKey: number): string | null {
        const archiveEntries = Object.entries(this._archiveConfig);
        for (const [ name, config ] of archiveEntries) {
            if (config.key === archiveKey) {
                return name;
            }
        }

        return null;
    }

    get archiveConfig(): { [key: string]: C } {
        return this._archiveConfig;
    }

    get database(): IndexDatabase {
        return this._database;
    }

}
