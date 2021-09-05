import fs from 'fs';
import path from 'path';


export interface IndexMetadata {
    version?: number;
    crc32?: number;
    sha256?: string;
}


export interface FileGroupMetadata extends IndexMetadata {
    fileName: string;
    nameHash?: number;
    size?: number;
    fileNames?: string[];
    errors?: string[];
}


export type FileGroupMetadataMap = Map<string, FileGroupMetadata>;


export interface ArchiveIndex extends IndexMetadata {
    index: number;
    groups: FileGroupMetadataMap;
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
    if(!fs.existsSync(archivePath)) {
        throw new Error(`${archivePath} does not exist!`);
    }

    const manifestFilePath = path.join(archivePath, '.index');

    if(!fs.existsSync(manifestFilePath)) {
        throw new Error(`No manifest file found for ${archivePath}`);
    }

    const manifestFileContent = fs.readFileSync(manifestFilePath, 'utf-8');

    if(!manifestFileContent) {
        throw new Error(`Error loading manifest for ${archivePath}`);
    }

    return JSON.parse(manifestFileContent, (key, value) => {
        if(typeof value === 'object' && value?.dataType === 'Map') {
            return new Map(value.value);
        } else {
            return value;
        }
    }) as ArchiveIndex;
};
