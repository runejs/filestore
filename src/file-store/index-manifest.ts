import { FileCompression, IndexName } from './archive';


export type IndexedFileMap = { [key: number]: FileMetadata };

export type FileErrorMap = { [key: number]: FileError };


export interface FileSettings {
    version?: number;
    crc?: number;
    sha256?: string;
}

export interface FileError extends FileSettings {
    name?: string;
    nameHash?: number;
    errors: string[];
}

export interface FileMetadata extends FileSettings {
    file: string;
    realName: string;
    fileSize?: number;
    nameHash?: number;
    children?: string[];
}

export interface  IndexManifest extends FileSettings {
    indexId: number;
    name: IndexName;
    fileCompression: FileCompression;
    fileExtension?: string;
    format?: number;
    settings?: number;
    files: { [key: number]: FileMetadata }; // file index within the archive => IndexedFileEntry
}
