import * as fs from 'graceful-fs';
import path from 'path';
import JSON5 from 'json5';
import { logger } from '@runejs/common';
import { Xtea, XteaKeys } from '../encryption';


export type EncryptionMethod = 'none' | 'xtea';


export interface ArchiveDetails {
    index: number;
    name: string;
    format?: number;
    compression: string;
    versioned?: boolean;
    encryption?: EncryptionMethod;
    fileExtension?: string;
    saveFileNames?: boolean;
    defaultFileNames?: { [key: string]: number };
}


export class StoreConfig {

    public static gameVersion: number | undefined;

    public static readonly archives: Map<string, ArchiveDetails> = new Map<string, ArchiveDetails>();
    public static readonly fileNames: Map<number, string> = new Map<number, string>();

    public static xteaKeys: Map<string, XteaKeys[]> = new Map<string, XteaKeys[]>();

    private static _storePath: string;

    public static register(storePath: string, gameVersion?: number | undefined): void {
        StoreConfig._storePath = storePath;
        StoreConfig.gameVersion = gameVersion;
        StoreConfig.loadArchiveConfig();
    }

    public static getXteaKey(fileName: string): XteaKeys | XteaKeys[] | null {
        if(!StoreConfig.xteaKeys.size) {
            StoreConfig.loadXteaKeys();
        }

        if(!StoreConfig.xteaKeys.size) {
            logger.error(`XTEA keys could not be loaded.`);
            return null;
        }

        const keySets = StoreConfig.xteaKeys.get(fileName);
        if(!keySets) {
            return null;
        }

        if(StoreConfig.gameVersion !== undefined) {
            return keySets.find(keySet => keySet.gameVersion === StoreConfig.gameVersion) ?? null;
        }

        return keySets;
    }

    public static archiveExists(archiveIndex: string): boolean {
        if(!StoreConfig.archives.size) {
            StoreConfig.loadArchiveConfig();
        }

        return StoreConfig.archives.has(archiveIndex);
    }

    public static getArchiveDetails(archiveIndex: string): ArchiveDetails {
        if(!StoreConfig.archives.size) {
            StoreConfig.loadArchiveConfig();
        }

        return StoreConfig.archives.get(archiveIndex);
    }

    public static getArchiveGroupNames(archiveIndex: string): { [groupName: string]: number } {
        return StoreConfig.getArchiveDetails(archiveIndex)?.defaultFileNames ?? {};
    }

    public static getArchiveName(archiveIndex: string): string | undefined {
        return StoreConfig.getArchiveDetails(archiveIndex)?.name ?? undefined;
    }

    public static getArchiveIndex(archiveName: string): string | undefined {
        for(const [ archiveIndex, archive ] of StoreConfig.archives) {
            if(archive.name === archiveName) {
                return archiveIndex;
            }
        }

        return undefined;
    }

    public static hashFileName(fileName: string): number {
        let hash = 0;
        for(let i = 0; i < fileName.length; i++) {
            hash = fileName.charCodeAt(i) + ((hash << 5) - hash);
        }

        return hash | 0;
    }

    public static getFileName(nameHash: string | number): string | undefined {
        if(typeof nameHash === 'string') {
            nameHash = Number(nameHash);
        }

        if(!StoreConfig.fileNames.size) {
            StoreConfig.loadFileNames();
        }

        return StoreConfig.fileNames.get(nameHash) ?? undefined;
    }

    public static loadXteaKeys(): void {
        StoreConfig.xteaKeys = Xtea.loadKeys(path.join(StoreConfig.storePath, 'config', 'xtea'));
    }

    public static loadFileNames(): void {
        const configPath = path.join(StoreConfig.storePath, 'config', 'name-hashes.json');
        if(!fs.existsSync(configPath)) {
            logger.error(`Error loading file names: ${configPath} was not found.`);
            return;
        }

        try {
            const nameTable = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as { [key: string]: string };
            Object.keys(nameTable).forEach(nameHash => StoreConfig.fileNames.set(Number(nameHash), nameTable[nameHash]));
        } catch(error) {
            logger.error(`Error loading file names:`, error);
        }
    }

    public static loadArchiveConfig(): void {
        const configPath = path.join(StoreConfig.storePath, 'config', 'archives.json5');
        if(!fs.existsSync(configPath)) {
            logger.error(`Error loading archive config: ${configPath} was not found.`);
            return;
        }

        try {
            const archiveInfo = JSON5.parse(fs.readFileSync(configPath, 'utf-8')) as { [key: string]: ArchiveDetails };
            const archiveNames = Object.keys(archiveInfo);
            for(const archiveName of archiveNames) {
                const archive = archiveInfo[archiveName];
                archive.name = archiveName;
                StoreConfig.archives.set(String(archive.index), archive);
            }
        } catch(error) {
            logger.error(`Error loading archive config:`, error);
        }
    }

    public static get storePath(): string {
        return StoreConfig._storePath;
    }

}
