import { existsSync, readFileSync } from 'graceful-fs';
import { join } from 'path';
import JSON5 from 'json5';
import { logger } from '@runejs/common';
import { ByteBuffer } from '@runejs/common/buffer';
import { Xtea, XteaKeys } from '@runejs/common/encrypt';
import { Crc32 } from '../util';
import { ArchiveProperties, Js5Store, Archive } from './index';


export class Store extends Archive {

    public readonly fileNameHashes: Map<number, string>;
    public readonly js5: Js5Store;

    private _path: string;
    private _archiveConfig: { [key: string]: ArchiveProperties };
    private _encryptionKeys: Map<string, XteaKeys[]>;
    private _gameVersion: number | undefined;
    private _gameVersionMissing: boolean;

    public constructor(storePath: string, gameVersion?: number) {
        super(255, { name: 'main' });
        this.store = this;
        this.js5 = new Js5Store(this);
        Crc32.init();
        this.fileNameHashes = new Map<number, string>();
        this._path = storePath;
        this._gameVersion = gameVersion;
        this.load();
    }

    public override js5Decode(): ByteBuffer | null {
        return new ByteBuffer([]); // @TODO
    }

    public override js5Encode(): ByteBuffer {
        return new ByteBuffer([]); // @TODO
    }

    public override compress(): ByteBuffer | null {
        if(!this.children?.size) {
            this.load(true, true);
        } else {
            const archives = Array.from(this.children.values());
            archives.forEach(archive => archive.read());
            archives.forEach(archive => archive.compress());
        }

        return null; // @TODO return main index file (crc table)
    }

    public override read(compress: boolean = false): ByteBuffer | null {
        if(!this.children?.size) {
            this.load(true, compress);
        } else {
            const archives = Array.from(this.children.values());
            archives.forEach(archive => archive.read());

            if(compress) {
                archives.forEach(archive => archive.compress());
            }
        }

        return null;
    }

    public load(readFiles: boolean = false, compress: boolean = false): void {
        this.loadArchiveConfig();
        this.loadEncryptionKeys();
        this.loadFileNames();

        const archiveConfigs = Object.values(this.archiveConfig);

        for(const config of archiveConfigs) {
            if(config.index === 255) {
                continue;
            }

            const archive = new Archive(config.index, {
                archive: this,
                encryption: config.encryption ?? 'none',
                compression: config.compression ?? 'none',
                name: config.name,
                nameHash: this.hashFileName(config.name)
            });

            this.set(config.index, archive);
        }

        if(readFiles) {
            const archives = Array.from(this.children.values());
            archives.forEach(archive => archive.read());

            if(compress) {
                archives.forEach(archive => archive.compress());
            }
        }
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

    public findFileName(nameHash: string | number): string | undefined {
        if(!this.fileNameHashes.size) {
            this.loadFileNames();
        }

        if(typeof nameHash === 'string') {
            nameHash = Number(nameHash);
        }

        return this.fileNameHashes.get(nameHash) ?? undefined;
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
