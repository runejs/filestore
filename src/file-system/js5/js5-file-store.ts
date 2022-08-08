import JSON5 from 'json5';
import { join } from 'path';
import { existsSync, readFileSync } from 'graceful-fs';
import { Js5ArchiveConfig } from '../../config';
import { JS5 } from './js5';
import { Js5Archive } from './js5-archive';
import { FileStoreBase } from '../file-store-base';
import { logger } from '../../../../common';
import { Js5Database } from '../../db/js5-database';


export class Js5FileStore extends FileStoreBase<Js5Database>{

    readonly js5: JS5;
    readonly archives: Map<number, Js5Archive>;

    private _archiveConfig: { [key: string]: Js5ArchiveConfig };

    constructor(gameBuild: string | number, storePath: string = './') {
        super(gameBuild, storePath);
        this.archives = new Map<number, Js5Archive>();
        this.loadArchiveConfig();
        this.js5 = new JS5(this);
    }

    override async openDatabase(): Promise<Js5Database> {
        this._database = new Js5Database(
            this.gameBuild,
            join(this.fileStorePath, 'index'),
            [ 'error', 'warn' ],
        );
        await this._database.openConnection();
        return this._database;
    }

    override async load(): Promise<void> {
        await this.js5.loadEncryptionKeys();
        await this.openDatabase();
    }

    async loadArchiveIndexes(): Promise<void> {
        for (const [ , archive ] of this.archives) {
            await archive.loadIndex();
        }
    }

    loadArchiveConfig(): void {
        const configPath = join(this.fileStorePath, 'config', 'js5-archives.json5');

        if (!existsSync(configPath)) {
            logger.error(`Error loading file store: ${configPath} was not found.`);
            return;
        }

        this._archiveConfig = JSON5.parse(
            readFileSync(configPath, 'utf-8')
        ) as { [key: string]: Js5ArchiveConfig };

        if (!Object.values(this._archiveConfig)?.length) {
            throw new Error(`Error reading archive configuration file. ` +
                `Please ensure that the ${configPath} file exists and is valid.`);
        }
    }

    createArchive(archiveKey: number): void {
        this.setArchive(archiveKey, new Js5Archive(this, archiveKey));
    }

    getArchive(archiveKey: number): Js5Archive | null;
    getArchive(archiveName: string): Js5Archive | null;
    getArchive(archiveKeyOrName: number | string): Js5Archive | null;
    getArchive(archiveKeyOrName: number | string): Js5Archive | null {
        if (typeof archiveKeyOrName === 'string') {
            return Array.from(this.archives.values()).find(
                a => a?.index?.name === archiveKeyOrName
            ) || null;
        } else {
            return this.archives.get(archiveKeyOrName) || null;
        }
    }

    setArchive(archiveKey: number, archive: Js5Archive): void;
    setArchive(archiveName: string, archive: Js5Archive): void;
    setArchive(archiveKeyOrName: number | string, archive: Js5Archive): void;
    setArchive(archiveKeyOrName: number | string, archive: Js5Archive): void {
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

    getArchiveConfig(archiveKey: number): Js5ArchiveConfig | null;
    getArchiveConfig(archiveName: string): Js5ArchiveConfig | null;
    getArchiveConfig(archiveKeyOrName: number | string): Js5ArchiveConfig | null;
    getArchiveConfig(archiveKeyOrName: number | string): Js5ArchiveConfig | null {
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

    get archiveConfig(): { [key: string]: Js5ArchiveConfig } {
        return this._archiveConfig;
    }

}
