export interface FileIndex {
    name: string;
    nameHash?: number;
    size?: number;
    crc32?: number;
    sha256?: string;
    stripeCount?: number;
    stripeSizes?: number[];
}


export interface GroupIndex extends FileIndex {
    version?: number;
    files?: Map<string, FileIndex>;
    errors?: string[];
}


export interface ArchiveIndex extends FileIndex {
    index: number;
    groups: Map<string, GroupIndex>;
}
