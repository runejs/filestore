import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'graceful-fs';
import { join } from 'path';
import JSON5 from 'json5';
import { ByteBuffer, logger } from '@runejs/common';
import { Xtea, XteaKeys } from '@runejs/common/encrypt';
import { Crc32 } from '@runejs/common/crc32';

import { Archive, FileState } from './index';
import { ArchiveIndexEntity, IndexService, StoreIndexEntity } from './db';
import { ArchiveConfig } from './config';


export type StoreFormat = 'unpacked' | 'packed';

export interface StoreOptions {
    outputPath?: string | undefined;
}


export class Store {

    public readonly archives: Map<string, Archive> = new Map<string, Archive>();
    public readonly fileNameHashes: Map<number, string> = new Map<number, string>();
    public readonly indexService: IndexService;

    private _js5MainIndex: ByteBuffer;
    private _js5ArchiveIndexes: Map<string, ByteBuffer>;
    private _js5MainArchiveData: ByteBuffer;

    private _index: StoreIndexEntity;
    private _mainArchive: Archive;
    private _data: ByteBuffer;
    private _compressed: boolean = false;
    private _js5Encoded: boolean = false;
    private _path: string;
    private _outputPath: string;
    private _archiveConfig: { [key: string]: ArchiveConfig };
    private _encryptionKeys: Map<string, XteaKeys[]>;
    private _gameBuild: string;
    private _gameBuildMissing: boolean;

    protected constructor(gameBuild: string, path: string, outputPath?: string) {
        this._gameBuild = gameBuild;
        this._path = path;
        this._outputPath = outputPath ? outputPath : join(path, 'unpacked');
        this.indexService = new IndexService(this);
        this.loadArchiveConfig();
        Crc32.init();
    }

    public static async create(gameBuild: string, path: string = './', options?: StoreOptions): Promise<Store> {
        const store = new Store(gameBuild, path, options?.outputPath);

        await store.indexService.load();

        store._index = await store.indexService.getStoreIndex();

        if(!store._index) {
            store._index = new StoreIndexEntity();
            store._index.gameBuild = gameBuild;
        }

        store.loadEncryptionKeys();
        store.loadFileNames();

        store.archives.clear();

        const archiveConfigs = Object.entries(store.archiveConfig);
        const mainArchiveConfig = Array.from(Object.values(store.archiveConfig)).find(a => a.index === 255);

        if(!mainArchiveConfig) {
            throw new Error(`Main archive (index 255) configuration was not found. ` +
                `Please configure the main archive using the archives.json5 file within the store config directory.`)
        }

        const mainArchiveIndex = new ArchiveIndexEntity();
        mainArchiveIndex.key = 255;
        mainArchiveIndex.gameBuild = gameBuild;
        mainArchiveIndex.name = 'main';
        store._mainArchive = new Archive(mainArchiveIndex, mainArchiveConfig, { store });

        let archiveIndexes = await store.indexService.getArchiveIndexes();

        if(!archiveIndexes?.length) {
            archiveIndexes = new Array(archiveConfigs.length);
        }

        for(const [ name, config ] of archiveConfigs) {
            if(config.index === 255) {
                continue;
            }

            if(config.build) {
                let revision: number;
                if(gameBuild.includes('_')) {
                    revision = Number(gameBuild.substring(gameBuild.indexOf('_') + 1));
                } else {
                    revision = Number(gameBuild);
                }
                if(revision < config.build) {
                    // logger.info(`Skipping archive ${name} as it is not available in this game build.`);
                    continue;
                }
            }

            let archiveIndex = archiveIndexes.find(a => a?.key === config.index);
            if(!archiveIndex) {
                archiveIndex = store.indexService.validateArchive({
                    numericKey: config.index,
                    name,
                    nameHash: store.hashFileName(name),
                    config
                });
            }

            const archive = new Archive(archiveIndex, config, {
                store, archive: store._mainArchive
            });

            store.archives.set(archive.key, archive);

            // Bulk-fetch the archive's groups
            const groups = archiveIndex.groups = await store.indexService.getGroupIndexes(archiveIndex);

            // Bulk-fetch the archive's files and sort them into the appropriate groups
            const archiveFileIndexes = await store.indexService.getFileIndexes(archiveIndex);
            for(const fileIndex of archiveFileIndexes) {
                const group = groups.find(group => group.key === fileIndex.groupKey);
                if(!group) {
                    continue;
                }

                if(!Array.isArray(group.files) || !group.files?.length) {
                    group.files = [ fileIndex ];
                } else {
                    group.files.push(fileIndex);
                }
            }
        }

        return store;
    }

    public loadPackedStore(): void {
        const js5StorePath = join(this.path, 'packed');

        if(!existsSync(js5StorePath)) {
            throw new Error(`${js5StorePath} could not be found.`);
        }

        const stats = statSync(js5StorePath);
        if(!stats?.isDirectory()) {
            throw new Error(`${js5StorePath} is not a valid directory.`);
        }

        const storeFileNames = readdirSync(js5StorePath);
        const dataFile = 'main_file_cache.dat2';
        const mainIndexFile = 'main_file_cache.idx255';

        if(storeFileNames.indexOf(dataFile) === -1) {
            throw new Error(`The main ${dataFile} data file could not be found.`);
        }

        if(storeFileNames.indexOf(mainIndexFile) === -1) {
            throw new Error(`The main ${mainIndexFile} index file could not be found.`);
        }

        const indexFilePrefix = 'main_file_cache.idx';
        const dataFilePath = join(js5StorePath, dataFile);
        const mainIndexFilePath = join(js5StorePath, mainIndexFile);

        this._js5MainArchiveData = new ByteBuffer(readFileSync(dataFilePath));
        this._js5MainIndex = new ByteBuffer(readFileSync(mainIndexFilePath));
        this._js5ArchiveIndexes = new Map<string, ByteBuffer>();

        for(const fileName of storeFileNames) {
            if(!fileName?.length || fileName === mainIndexFile || fileName === dataFile) {
                continue;
            }

            if(!fileName.startsWith(indexFilePrefix)) {
                continue;
            }

            const index = fileName.substring(fileName.indexOf('.idx') + 4);
            const numericIndex = Number(index);

            if(isNaN(numericIndex)) {
                logger.error(`Index file ${fileName} does not have a valid extension.`);
            }

            if(!this.has(index)) {
                logger.warn(`Archive ${index} was found within the JS5 store, but is not configured for flat file store use.`,
                    `Please add the archive to the archives.json5 configuration file to load it properly.`);
                continue;
            }

            this._js5ArchiveIndexes.set(index, new ByteBuffer(readFileSync(join(js5StorePath, fileName))));
        }

        logger.info(`Packed store loaded for game build ${this.gameBuild}.`);
    }

    public pack(): void {
        // @TODO
    }

    public decode(decodeGroups: boolean = true): ByteBuffer | null {
        this.archives.forEach(archive => archive.decode(decodeGroups));
        return null;
    }

    public encode(encodeGroups: boolean = true): ByteBuffer {
        const fileSize = 4 * this.archiveCount;

        this._data = new ByteBuffer(fileSize + 31);

        this._data.put(0);
        this._data.put(fileSize, 'int');

        for(let archiveIndex = 0; archiveIndex < this.archiveCount; archiveIndex++) {
            this._data.put(this.get(archiveIndex).index.crc32, 'int');
        }

        this.mainArchive.setData(this._data, FileState.encoded);
        this.mainArchive.index.data = this.index.data = this._data.toNodeBuffer();

        if(encodeGroups) {
            this.archives.forEach(archive => archive.encode(true));
        }

        return this.data;
    }

    public compress(compressGroups: boolean = true): ByteBuffer | null {
        this.archives.forEach(archive => archive.compress(compressGroups));

        this._compressed = true;
        return this._data;
    }

    public async read(compress: boolean = false, readDiskFiles: boolean = true): Promise<ByteBuffer> {
        this._js5Encoded = false;
        this._compressed = false;

        for(const [ , archive ] of this.archives) {
            await archive.read(false, readDiskFiles);
        }

        if(compress) {
            this.compress();
        }

        return this.encode();
    }

    public write(): void {
        if(!this.archives.size) {
            throw new Error(`Archives not loaded, please load a flat file store or a JS5 store.`);
        }

        const start = Date.now();
        logger.info(`Writing flat file store...`);

        try {
            if(existsSync(this.outputPath)) {
                rmSync(this.outputPath, { recursive: true, force: true });
            }

            mkdirSync(this.outputPath, { recursive: true });
        } catch(error) {
            logger.error(`Error clearing file store output path (${this.outputPath}):`, error);
            return;
        }

        try {
            logger.info(`Writing archive contents to disk...`);
            this.archives.forEach(archive => archive.write());
            logger.info(`Archives written.`);
        } catch(error) {
            logger.error(`Error writing archives:`, error);
            return;
        }

        const end = Date.now();
        logger.info(`Flat file store written in ${(end - start) / 1000} seconds.`);
    }

    public async saveIndexData(saveArchives: boolean = true, saveGroups: boolean = true, saveFiles: boolean = true): Promise<void> {
        try {
            await this.indexService.saveStoreIndex();
            logger.info(`File store index saved.`);
        } catch(error) {
            logger.error(`Error indexing file store:`, error);
            return;
        }

        if(saveArchives) {
            logger.info(`Indexing archives...`);

            for(const [ , archive ] of this.archives) {
                try {
                    await archive.saveIndexData(false);
                } catch(error) {
                    logger.error(`Error indexing archive:`, error);
                    return;
                }
            }
        }

        if(saveGroups) {
            logger.info(`Indexing archive groups...`);

            for(const [ , archive ] of this.archives) {
                try {
                    await archive.saveGroupIndexes(false);
                } catch(error) {
                    logger.error(`Error indexing group:`, error);
                    return;
                }
            }
        }

        if(saveFiles) {
            logger.info(`Indexing archive files...`);

            for(const [ , archive ] of this.archives) {
                try {
                    await archive.saveFlatFileIndexes();
                } catch(error) {
                    logger.error(`Error indexing flat file:`, error);
                    return;
                }
            }
        }
    }

    public find(archiveName: string): Archive {
        return Array.from(this.archives.values()).find(child => child?.name === archiveName) ?? null;
    }

    public get(archiveKey: string): Archive | null;
    public get(archiveKey: number): Archive | null;
    public get(archiveKey: string | number): Archive | null;
    public get(archiveKey: string | number): Archive | null {
        return this.archives.get(String(archiveKey)) ?? null;
    }

    public set(archiveKey: string, archive: Archive): void;
    public set(archiveKey: number, archive: Archive): void;
    public set(archiveKey: string | number, archive: Archive): void;
    public set(archiveKey: string | number, archive: Archive): void {
        this.archives.set(String(archiveKey), archive);
    }

    public has(archiveKey: string | number): boolean {
        return this.archives.has(String(archiveKey));
    }

    public loadArchiveConfig(): void {
        const configPath = join(this.path, 'config', 'archives.json5');
        if(!existsSync(configPath)) {
            logger.error(`Error loading store: ${configPath} was not found.`);
            return;
        }

        this._archiveConfig = JSON5.parse(readFileSync(configPath, 'utf-8')) as { [key: string]: ArchiveConfig };

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

        if(this.gameBuild !== undefined) {
            return keySets.find(keySet => keySet.gameBuild === this.gameBuild) ?? null;
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

    public setGameBuildMissing(): void {
        this._gameBuildMissing = true;
    }

    public get archiveCount(): number {
        return this.archives?.size || 0;
    }

    public get js5MainIndex(): ByteBuffer {
        if(!this._js5MainIndex?.length || !this._js5MainArchiveData?.length) {
            this.decode();
        }

        return this._js5MainIndex;
    }

    public get js5ArchiveIndexes(): Map<string, ByteBuffer> {
        if(!this._js5MainIndex?.length || !this._js5MainArchiveData?.length) {
            this.decode();
        }

        return this._js5ArchiveIndexes;
    }

    public get js5MainArchiveData(): ByteBuffer {
        if(!this._js5MainIndex?.length || !this._js5MainArchiveData?.length) {
            this.decode();
        }

        return this._js5MainArchiveData;
    }

    public get index(): StoreIndexEntity {
        return this._index;
    }

    public get mainArchive(): Archive {
        return this._mainArchive;
    }

    public get data(): ByteBuffer {
        return this._data;
    }

    public get compressed(): boolean {
        return this._compressed;
    }

    public get js5Encoded(): boolean {
        return this._js5Encoded;
    }

    public get path(): string {
        return this._path;
    }

    public get outputPath(): string {
        return this._outputPath;
    }

    public get gameBuild(): string {
        return this._gameBuild;
    }

    public get archiveConfig(): { [p: string]: ArchiveConfig } {
        return this._archiveConfig;
    }

    public get encryptionKeys(): Map<string, XteaKeys[]> {
        return this._encryptionKeys;
    }

    public get gameBuildMissing(): boolean {
        return this._gameBuildMissing;
    }
}
