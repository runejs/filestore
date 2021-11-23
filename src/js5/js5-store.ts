import path from 'path';
import * as fs from 'fs';
import { logger } from '@runejs/common';
import { ByteBuffer } from '@runejs/common/buffer';
import { Js5Archive } from './js5-archive';
import { StoreConfig } from '../config';
import { Crc32 } from '../util';


export interface Js5StoreOptions {
    storePath: string;
    gameVersion?: number | undefined;
    xteaDisabled?: boolean;
}


export class Js5Store {

    public readonly archives: Map<string, Js5Archive>;
    public readonly config: StoreConfig;
    public readonly storePath: string;

    public xteaDisabled: boolean;

    private readonly _packedIndexChannels: Map<string, ByteBuffer>;
    private _packedMainIndexChannel: ByteBuffer;
    private _packedDataChannel: ByteBuffer;

    public constructor(options: Js5StoreOptions) {
        if(!options?.storePath) {
            throw new Error(`Store path not found. Please include 'storePath' in your JS5 store options.`);
        }

        this.storePath = options.storePath;
        this.xteaDisabled = options.xteaDisabled ?? false;
        this.archives = new Map<string, Js5Archive>();
        this._packedIndexChannels = new Map<string, ByteBuffer>();
        StoreConfig.register(options.storePath, options.gameVersion);
        Crc32.generateCrcLookupTable();
        this.readPackedStore();
    }

    public decode(decodeGroups: boolean = true): void {
        for(const [ , archive ] of this.archives) {
            archive.decode(decodeGroups);
        }
    }

    public readPackedStore(): void {
        const js5StorePath = path.join(this.storePath, 'js5');

        if(!fs.existsSync(js5StorePath)) {
            throw new Error(`${js5StorePath} could not be found.`);
        }

        const stats = fs.statSync(js5StorePath);
        if(!stats?.isDirectory()) {
            throw new Error(`${js5StorePath} is not a valid directory.`);
        }

        const storeFileNames = fs.readdirSync(js5StorePath);
        const dataFile = 'main_file_cache.dat2'; // @TODO support more
        const mainIndexFile = 'main_file_cache.idx255';

        if(storeFileNames.indexOf(dataFile) === -1) {
            throw new Error(`The main ${dataFile} data file could not be found.`);
        }

        if(storeFileNames.indexOf(mainIndexFile) === -1) {
            throw new Error(`The main ${mainIndexFile} index file could not be found.`);
        }

        const indexFilePrefix = 'main_file_cache.idx';
        const dataFilePath = path.join(js5StorePath, dataFile);
        const mainIndexFilePath = path.join(js5StorePath, mainIndexFile);

        this._packedDataChannel = new ByteBuffer(fs.readFileSync(dataFilePath));
        this._packedMainIndexChannel = new ByteBuffer(fs.readFileSync(mainIndexFilePath));

        const mainArchive = new Js5Archive(this, 255);
        this.setArchive(255, mainArchive);

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

            if(!StoreConfig.archiveExists(index)) {
                logger.warn(`Archive ${index} found, but not configured.`);
                continue;
            }

            const fileData = new ByteBuffer(fs.readFileSync(path.join(js5StorePath, fileName)));
            this._packedIndexChannels.set(index, fileData);

            try {
                const archive = new Js5Archive(this, numericIndex, mainArchive);
                this.setArchive(index, archive);
            } catch(error) {
                logger.error(error);
            }
        }
    }

    /**
     * Adds a new or replaces an existing archive within the file store.
     * @param archiveIndex The index of the archive to add or change.
     * @param archive The archive to add or change.
     */
    public setArchive(archiveIndex: number | string, archive: Js5Archive): void {
        if(typeof archiveIndex === 'number') {
            archiveIndex = String(archiveIndex);
        }

        this.archives.set(archiveIndex, archive);
    }

    /**
     * Fetches an archive from the file store by index.
     * @param archiveIndex The index of the archive to find.
     */
    public getArchive(archiveIndex: number | string): Js5Archive {
        if(typeof archiveIndex === 'number') {
            archiveIndex = String(archiveIndex);
        }

        return this.archives.get(archiveIndex);
    }

    /**
     * Fetches an archive from the file store by file name.
     * @param archiveName The name of the archive to find.
     */
    public findArchive(archiveName: string): Js5Archive {
        return this.archives.get(StoreConfig.getArchiveIndex(archiveName));
    }

    public get packedMainIndexChannel(): ByteBuffer {
        return this._packedMainIndexChannel;
    }

    public get packedIndexChannels(): Map<string, ByteBuffer> {
        return this._packedIndexChannels;
    }

    public get packedDataChannel(): ByteBuffer {
        return this._packedDataChannel;
    }
}
