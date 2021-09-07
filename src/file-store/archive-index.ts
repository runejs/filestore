import fs from 'fs';
import path from 'path';


export interface IndexMetadata {
    crc32?: number;
    sha256?: string;
}


export interface FileMetadata extends IndexMetadata {
    name: string;
    nameHash?: number;
    size?: number;
}


export interface FileGroupMetadata extends FileMetadata {
    version?: number;
    files?: Map<string, FileMetadata>;
    errors?: string[];
}


export interface ArchiveIndex extends IndexMetadata {
    index: number;
    groups: Map<string, FileGroupMetadata>;
}


export const writeIndexFile = (archivePath: string, manifest: ArchiveIndex): void => {
    fs.writeFileSync(path.join(archivePath, `.index`), JSON.stringify(manifest, (key, value) => {
        if(value instanceof Map) {
            return { dataType: 'Map', value: Array.from(value.entries()) };
        } else {
            return value;
        }
    }, 4));
};


export const readIndexFile = (archivePath: string): ArchiveIndex => {
    return JSON.parse(fs.readFileSync(path.join(archivePath, `.index`), 'utf-8'), (key, value) => {
        if(typeof value === 'object' && value?.dataType === 'Map') {
            return new Map(value.value);
        } else {
            return value;
        }
    }) as ArchiveIndex;
};
