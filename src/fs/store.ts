import { existsSync, readFileSync, mkdirSync, rmSync } from 'graceful-fs';
import { join } from 'path';
import JSON5 from 'json5';
import { logger } from '@runejs/common';
import { ByteBuffer } from '@runejs/common/buffer';
import { Xtea, XteaKeys } from '@runejs/common/encrypt';
import { Crc32 } from '../util';
import { ArchiveProperties, Js5Store, Archive } from './index';


export class Store {

    public readonly archives: Map<string, Archive>;
    public readonly fileNameHashes: Map<number, string>;
    public readonly js5: Js5Store;

    private _data: ByteBuffer;
    private _path: string;
    private _outputPath: string;
    private _archiveConfig: { [key: string]: ArchiveProperties };
    private _encryptionKeys: Map<string, XteaKeys[]>;
    private _gameVersion: number | undefined;
    private _gameVersionMissing: boolean;

    public constructor(gameVersion: number, storePath: string, outputPath: string) {
        this._path = storePath;
        this._outputPath = outputPath;
        this._gameVersion = gameVersion;
        this.loadArchiveConfig();
        this.js5 = new Js5Store(this);
        Crc32.init();
        this.archives = new Map<string, Archive>();
        this.fileNameHashes = new Map<number, string>();
        this.load();
    }

    public js5Decode(): ByteBuffer | null {
        const archives = Array.from(this.archives.values());
        archives.forEach(archive => {
            if(archive.numericKey === 255) {
                return;
            }

            archive.js5Decode();
        });

        return new ByteBuffer([]); // @TODO
    }

    public js5Encode(): ByteBuffer {
        return new ByteBuffer([]); // @TODO
    }

    public compress(): ByteBuffer | null {
        if(!this.archives?.size) {
            this.load(true, true);
        } else {
            const archives = Array.from(this.archives.values());
            archives.forEach(archive => archive.read());
            archives.forEach(archive => archive.compress());
        }

        return null; // @TODO return main index file (crc table)
    }

    public read(compress: boolean = false): ByteBuffer | null {
        if(!this.archives?.size) {
            this.load(true, compress);
        } else {
            const archives = Array.from(this.archives.values());
            archives.forEach(archive => archive.read());

            if(compress) {
                archives.forEach(archive => archive.compress());
            }
        }

        return null;
    }

    public write(): void {
        if(!this.archives.size) {
            throw new Error(`Archives not loaded, please load a flat file store or a JS5 store.`);
        }

        const start = Date.now();
        logger.info(`Writing flat file store...`);

        if(existsSync(this.outputPath)) {
            rmSync(this.outputPath, { recursive: true, force: true });
        }

        mkdirSync(this.outputPath, { recursive: true });

        Array.from(this.archives.values()).forEach(archive => archive.write());

        const end = Date.now();
        logger.info(`Flat file store written in ${(end - start) / 1000} seconds.`);
    }

    public load(readFiles: boolean = false, compress: boolean = false): void {
        this.loadEncryptionKeys();
        this.loadFileNames();

        this.archives.clear();

        const archiveConfigs = Object.entries(this.archiveConfig);

        for(const [ name, config ] of archiveConfigs) {
            if(config.index === 255) {
                continue;
            }

            const archive = new Archive(config.index, config, {
                store: this,
                encryption: config.encryption ?? 'none',
                compression: config.compression ?? 'none',
                name
            });

            this.archives.set(archive.key, archive);
        }

        if(readFiles) {
            const archives = Array.from(this.archives.values());
            archives.forEach(archive => archive.read());

            if(compress) {
                archives.forEach(archive => archive.compress());
            }
        }
    }

    public find(archiveName: string): Archive {
        const archives = Array.from(this.archives.values());
        return archives.find(child => child?.name === archiveName) ?? null;
    }

    public has(archiveIndex: string | number): boolean {
        return this.archives.has(String(archiveIndex));
    }

    public loadArchiveConfig(): void {
        const configPath = join(this.path, 'config', 'archives.json5');
        if(!existsSync(configPath)) {
            logger.error(`Error loading store: ${configPath} was not found.`);
            return;
        }

        this._archiveConfig = JSON5.parse(readFileSync(configPath, 'utf-8')) as { [key: string]: ArchiveProperties };

        if(!Object.values(this._archiveConfig)?.length) {
            throw new Error(`Error reading archive configuration file. ` +
                `Please ensure that the ${configPath} file exists and is valid.`);
        }
    }

    public getEncryptionKeys(fileName: string): XteaKeys | XteaKeys[] | null {
        if(!this.encryptionKeys.size) {
            this.loadEncryptionKeys();
        }

        const keySets = this.encryptionKeys.get(fileName);
        if(!keySets) {
            return null;
        }

        if(this.gameVersion !== undefined) {
            return keySets.find(keySet => keySet.gameVersion === this.gameVersion) ?? null;
        }

        return keySets;
    }

    public loadEncryptionKeys(): void {
        const configPath = join(this.path, 'config', 'xtea');
        this._encryptionKeys = Xtea.loadKeys(configPath);

        if(!this.encryptionKeys.size) {
            throw new Error(`Error reading encryption key lookup table. ` +
                `Please ensure that the ${configPath} file exists and is valid.`);
        }
    }

    public hashFileName(fileName: string): number {
        if(!fileName) {
            return 0;
        }

        let hash = 0;
        for(let i = 0; i < fileName.length; i++) {
            hash = fileName.charCodeAt(i) + ((hash << 5) - hash);
        }

        return hash | 0;
    }

    public findFileName(nameHash: string | number | undefined, defaultName?: string | undefined): string | undefined {
        if(!this.fileNameHashes.size) {
            this.loadFileNames();
        }

        if(nameHash === undefined || nameHash === null) {
            return defaultName;
        }

        if(typeof nameHash === 'string') {
            nameHash = Number(nameHash);
        }

        if(isNaN(nameHash) || nameHash === -1 || nameHash === 0) {
            return defaultName;
        }

        return this.fileNameHashes.get(nameHash) || defaultName;
    }

    public loadFileNames(): void {
        const configPath = join(this.path, 'config', 'name-hashes.json');
        if(!existsSync(configPath)) {
            logger.error(`Error loading file names: ${configPath} was not found.`);
            return;
        }

        const nameTable = JSON.parse(readFileSync(configPath, 'utf-8')) as { [key: string]: string };
        Object.keys(nameTable).forEach(nameHash => this.fileNameHashes.set(Number(nameHash), nameTable[nameHash]));

        if(!this.fileNameHashes.size) {
            throw new Error(`Error reading file name lookup table. ` +
                `Please ensure that the ${configPath} file exists and is valid.`);
        }
    }

    public setGameVersionMissing(): void {
        this._gameVersionMissing = true;
    }

    public get path(): string {
        return this._path;
    }

    public get outputPath(): string {
        return this._outputPath;
    }

    public get gameVersion(): number | undefined {
        return this._gameVersion;
    }

    public get archiveConfig(): { [p: string]: ArchiveProperties } {
        return this._archiveConfig;
    }

    public get encryptionKeys(): Map<string, XteaKeys[]> {
        return this._encryptionKeys;
    }

    public get gameVersionMissing(): boolean {
        return this._gameVersionMissing;
    }
}
