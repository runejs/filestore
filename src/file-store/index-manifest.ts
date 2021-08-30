export interface IndexMetadata {
    version?: number;
    crc?: number;
    sha256?: string;
}


export interface FileGroupMetadata extends IndexMetadata {
    name: string;
    nameHash?: number;
    size?: number;
    fileNames?: string[];
    errors?: string[];
}


export type FileGroupMetadataMap = { [key: number]: FileGroupMetadata };


export interface IndexManifest extends IndexMetadata {
    index: number;
    groups: FileGroupMetadataMap;
}
