import { join } from 'path';
import { existsSync, readFileSync } from 'graceful-fs';
import { logger } from '@runejs/common';


export class NameHasher {

    readonly configPath: string;
    readonly fileNameHashes: Map<number, string>;

    constructor(configPath: string) {
        this.configPath = configPath;
        this.fileNameHashes = new Map<number, string>();
        this.loadFileNames();
    }

    hashJagFileName(fileName: string): number {
        const INT_MAX = 2147483648;
        let hash = 0;
        fileName = fileName.toUpperCase();

        for (let i = 0; i < fileName.length; i++) {
            hash = hash * 61 + fileName.charCodeAt(i) - 32;

            // Emulate Java's INT overflow-wrapping
            while (hash > INT_MAX) {
                const diff = hash - INT_MAX;
                hash = -INT_MAX + diff;
            }

            while (hash < -INT_MAX) {
                const diff = Math.abs(hash) - INT_MAX;
                hash = INT_MAX - diff;
            }
        }

        return hash;
    }

    hashJs5FileName(fileName: string): number {
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
        const configPath = join(this.configPath, 'name-hashes.json');
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

}
