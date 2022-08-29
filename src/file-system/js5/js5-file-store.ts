import JSON5 from 'json5';
import { join } from 'path';
import { existsSync, readFileSync } from 'graceful-fs';
import { Js5ArchiveConfig } from '../../config';
import { JS5 } from './js5';
import { Js5Archive } from './js5-archive';
import { FileStoreBase } from '../file-store-base';
import { logger } from '../../../../common';
import { Js5Database, Js5IndexEntity } from '../../db/js5';
import { Js5File } from './js5-file';


export class Js5FileStore extends FileStoreBase<Js5Database>{

    readonly js5: JS5;
    readonly archives: Map<number, Js5Archive>;

    private _archiveConfig: { [key: string]: Js5ArchiveConfig };
    private _loaded: boolean = false;

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

    override async load(
        loadArchiveEntities: boolean = false,
        loadArchiveChildEntities: boolean = false,
        loadGroupChildEntities: boolean = false,
    ): Promise<void> {
        if (this._loaded) {
            return;
        }

        await this.js5.loadEncryptionKeys();
        await this.openDatabase();

        if (loadArchiveEntities) {
            await this.loadArchiveEntities(loadArchiveChildEntities, loadGroupChildEntities);
        }

        this._loaded = true;
    }

    /**
     * Load all archive entities for this file store.
     * @param loadArchiveChildEntities Whether or not to load group entities under each archive.
     * Defaults to `false`.
     * @param loadGroupChildEntities Whether or not to load flat file entities under each group.
     * Only works if `loadArchiveChildEntities` is also set to `true`. Defaults to `false`.
     */
    async loadArchiveEntities(
        loadArchiveChildEntities: boolean = false,
        loadGroupChildEntities: boolean = false,
    ): Promise<void> {
        if (!this.archives.size) {
            const archiveEntities = await this.database.getIndexes({
                fileType: 'ARCHIVE'
            });

            for (const entity of archiveEntities) {
                const archive = this.createArchive(entity.key);
                archive.index = entity;
            }
        } else {
            for (const [ , archive ] of this.archives) {
                await archive.loadIndex();
            }
        }

        if (loadArchiveChildEntities) {
            for (const [ , archive ] of this.archives) {
                await archive.loadGroupIndexes();
            }

            if (loadGroupChildEntities) {
                // Bulk load grouped files to save computing time
                const files = await this.database.getIndexes({
                    fileType: 'FILE',
                });

                for (const fileEntity of files) {
                    const archive = await this.getArchive(fileEntity.archiveKey);
                    const group = await archive.getGroup(fileEntity.groupKey);
                    const file = new Js5File(this, fileEntity.key, group);
                    file.index = fileEntity;
                    group.setFile(fileEntity.key, file);
                }
            }
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

    createArchive(archiveKey: number): Js5Archive {
        const archive = new Js5Archive(this, archiveKey);
        this.setArchive(archiveKey, archive);
        return archive;
    }

    async getArchive(archiveKey: number): Promise<Js5Archive | null>;
    async getArchive(archiveName: string): Promise<Js5Archive | null>;
    async getArchive(archiveIdentifier: number | string): Promise<Js5Archive | null>;
    async getArchive(archiveIdentifier: number | string): Promise<Js5Archive | null> {
        let archive: Js5Archive;

        if (typeof archiveIdentifier === 'string') {
            archive = Array.from(this.archives.values()).find(
                a => a?.index?.name === archiveIdentifier
            ) || null;
        } else {
            archive = this.archives.get(archiveIdentifier) || null;
        }

        if (!archive?.index) {
            let archiveEntity: Js5IndexEntity;

            if (typeof archiveIdentifier === 'number' || /^\d*$/.test(archiveIdentifier)) {
                const archiveKey = typeof archiveIdentifier === 'string' ? parseInt(archiveIdentifier, 10) : archiveIdentifier;
                archiveEntity = await this.database.getIndex({
                    fileType: 'ARCHIVE',
                    key: archiveKey
                });
            } else {
                archiveEntity = await this.database.getIndex({
                    fileType: 'ARCHIVE',
                    name: String(archiveIdentifier)
                });
            }

            if (!archive) {
                archive = new Js5Archive(this, archiveEntity.key);
                archive.index = archiveEntity;
                this.archives.set(archiveEntity.key, archive);
            } else {
                archive.index = archiveEntity;
            }
        }

        return archive;
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
