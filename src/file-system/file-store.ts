import { join } from 'path';
import JSON5 from 'json5';
import { existsSync, readFileSync } from 'graceful-fs';
import { logger } from '@runejs/common';
import { IndexDatabase } from './db/index-database';
import { ArchiveConfig } from '../config';
import { JS5 } from './js5';


export class FileStore {

    readonly gameBuild: string;
    readonly fileStorePath: string;
    readonly fileNameHashes: Map<number, string>;
    readonly js5: JS5;

    private _archiveConfig: { [key: string]: ArchiveConfig };
    private _database: IndexDatabase;

    constructor(gameBuild: string, storePath: string = './') {
        this.gameBuild = gameBuild;
        this.fileStorePath = storePath;
        this.fileNameHashes = new Map<number, string>();
        this.loadArchiveConfig();
        this.loadFileNames();
        this.js5 = new JS5(this);
    }

    hashFileName(fileName: string): number {
        if (!fileName) {
            return 0;
        }

        let hash = 0;
        for (let i = 0; i < fileName.length; i++) {
            hash = fileName.charCodeAt(i) + ((hash << 5) - hash);
        }

        const nameHash = hash | 0;

        this.fileNameHashes.set(nameHash, fileName);

        return nameHash;
    }

    findFileName(nameHash: string | number | undefined, defaultName?: string | undefined): string | undefined {
        if (!this.fileNameHashes.size) {
            this.loadFileNames();
        }

        if (nameHash === undefined || nameHash === null) {
            return defaultName;
        }

        if (typeof nameHash === 'string') {
            nameHash = Number(nameHash);
        }

        if (isNaN(nameHash) || nameHash === -1 || nameHash === 0) {
            return defaultName;
        }

        return this.fileNameHashes.get(nameHash) || defaultName;
    }

    loadFileNames(): void {
        const configPath = join(this.fileStorePath, 'config', 'name-hashes.json');
        if (!existsSync(configPath)) {
            logger.error(`Error loading file names: ${configPath} was not found.`);
            return;
        }

        const nameTable = JSON.parse(
            readFileSync(configPath, 'utf-8')
        ) as { [key: string]: string };

        Object.keys(nameTable).forEach(
            nameHash => this.fileNameHashes.set(Number(nameHash), nameTable[nameHash])
        );

        if(!this.fileNameHashes.size) {
            logger.error(`Error reading file name lookup table. ` +
                `Please ensure that the ${configPath} file exists and is valid.`);
        }
    }

    loadArchiveConfig(): void {
        const configPath = join(this.fileStorePath, 'config', 'archives.json5');
        if (!existsSync(configPath)) {
            logger.error(`Error loading file store: ${configPath} was not found.`);
            return;
        }

        this._archiveConfig = JSON5.parse(
            readFileSync(configPath, 'utf-8')
        ) as { [key: string]: ArchiveConfig };

        if (!Object.values(this._archiveConfig)?.length) {
            throw new Error(`Error reading archive configuration file. ` +
                `Please ensure that the ${configPath} file exists and is valid.`);
        }
    }

    async openDatabase(): Promise<IndexDatabase> {
        this._database = new IndexDatabase(this.gameBuild, join(this.fileStorePath, 'indexes'));
        await this._database.openConnection();
        return this._database;
    }

    get archiveConfig(): { [key: string]: ArchiveConfig } {
        return this._archiveConfig;
    }

    get database(): IndexDatabase {
        return this._database;
    }

}
