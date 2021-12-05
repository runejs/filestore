export interface FileIndex {
    key: number;
    name: string;
    nameHash?: number;
    size?: number;
    crc32?: number;
    sha256?: string;
    version?: number;
    stripes?: number[];
    errors?: string[];
    children?: Map<string, FileIndex>;
}
