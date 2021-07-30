export interface IndexMetadata {
    version?: number;
    crc?: number;
    sha256?: string;
}


export interface FileError extends IndexMetadata {
    name?: string;
    nameHash?: number;
    errors: string[];
}

export type FileErrorMap = { [key: number]: FileError };


export interface FileMetadata extends IndexMetadata {
    name: string;
    nameHash?: number;
    size?: number;
    children?: string[];
}

export type IndexedFileMap = { [key: number]: FileMetadata };


export interface IndexManifest extends IndexMetadata {
    index: number;
    files: IndexedFileMap;
    errors?: FileErrorMap;
}
