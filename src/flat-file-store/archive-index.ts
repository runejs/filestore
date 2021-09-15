import fs from 'fs';
import path from 'path';


export interface IndexBase {
    crc32?: number;
    sha256?: string;
}


export interface FileIndex extends IndexBase {
    name: string;
    nameHash?: number;
    size?: number;
    stripeCount?: number;
    stripeSizes?: number[];
}


export interface GroupIndex extends FileIndex {
    version?: number;
    files?: Map<string, FileIndex>;
    errors?: string[];
}


export interface ArchiveIndex extends IndexBase {
    index: number;
    groups: Map<string, GroupIndex>;
}


export const writeArchiveIndexFile = (archivePath: string, manifest: ArchiveIndex): void => {
    fs.writeFileSync(path.join(archivePath, `.index`), JSON.stringify(manifest, (key, value) => {
        if(value instanceof Map) {
            return { dataType: 'Map', value: Array.from(value.entries()) };
        } else {
            return value;
        }
    }, 4));
};


export const readArchiveIndexFile = (archivePath: string): ArchiveIndex => {
    return JSON.parse(fs.readFileSync(path.join(archivePath, `.index`), 'utf-8'), (key, value) => {
        if(typeof value === 'object' && value?.dataType === 'Map') {
            return new Map(value.value);
        } else {
            return value;
        }
    }) as ArchiveIndex;
};
