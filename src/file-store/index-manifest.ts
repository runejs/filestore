export interface IndexMetadata {
    version?: number;
    crc?: number;
    sha256?: string;
}


export interface FileMetadata extends IndexMetadata {
    name: string;
    nameHash?: number;
    size?: number;
    children?: string[];
    errors?: string[];
}


export type FileMetadataMap = Map<number, FileMetadata>;


export interface IndexManifest extends IndexMetadata {
    index: number;
    files: FileMetadataMap;
}
