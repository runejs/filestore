import { writeFileSync, readFileSync } from 'graceful-fs';
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
    const filePath = path.join(archivePath, `.index`);
    const fileData: string = JSON.stringify(manifest, (key, value) => {
        if(value instanceof Map) {
            return { dataType: 'Map', value: Array.from(value.entries()) };
        } else {
            return value;
        }
    }, 4);

    writeFileSync(filePath, fileData);
};


export const readArchiveIndexFile = (archivePath: string): ArchiveIndex => {
    const filePath = path.join(archivePath, `.index`);
    const fileData: string = readFileSync(filePath, 'utf-8');
    return JSON.parse(fileData, (key, value) => {
        if(typeof value === 'object' && value?.dataType === 'Map') {
            return new Map(value.value);
        } else {
            return value;
        }
    }) as ArchiveIndex;
};
