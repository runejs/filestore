import { writeFile, readFile } from 'graceful-fs';
import path from 'path';
import { logger } from '@runejs/common';


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


export const writeArchiveIndexFile = async (archivePath: string, manifest: ArchiveIndex): Promise<void> => {
    const filePath = path.join(archivePath, `.index`);

    const fileData: string = JSON.stringify(manifest, (key, value) => {
        if(value instanceof Map) {
            return { dataType: 'Map', value: Array.from(value.entries()) };
        } else {
            return value;
        }
    }, 4);

    await new Promise<void>(resolve => writeFile(filePath, fileData, () => resolve()));
};


export const readArchiveIndexFile = async (archivePath: string): Promise<ArchiveIndex> => {
    const fileData: string = await new Promise<string>((resolve =>
        readFile(path.join(archivePath, `.index`), 'utf-8', (err, data) => {
            if(err) {
                logger.error(err);
                resolve('');
            } else {
                resolve(data);
            }
        })));

    return JSON.parse(fileData, (key, value) => {
        if(typeof value === 'object' && value?.dataType === 'Map') {
            return new Map(value.value);
        } else {
            return value;
        }
    }) as ArchiveIndex;
};
