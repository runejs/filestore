/**
 * String representations of numeric index ids.
 */
export type IndexName = 'main' | 'configs' | 'sprites' | 'music' | 'jingles' | 'sounds' | 'binary' |
    'widgets' | 'maps' | 'models' | 'textures' | 'scripts' | 'bases' | 'animations';


/**
 * A map of unique index keys to numeric ids.
 */
export const indexIdMap: { [key: string]: number } = {
    'animations': 0,
    'bases': 1,
    'configs': 2,
    'widgets': 3,
    'sounds': 4,
    'maps': 5,
    'music': 6,
    'models': 7,
    'sprites': 8,
    'textures': 9,
    'binary': 10,
    'jingles': 11,
    'scripts': 12,
    'main': 255
};


export const getIndexName = (indexId: number): IndexName => {
    const indexNames = Object.keys(indexIdMap);
    for(const indexName of indexNames) {
        if(indexIdMap[indexName] === indexId) {
            return indexName as IndexName;
        }
    }

    return null;
};


export const fileExtensions: { [key: string]: string } = {
    'animations': '.dat',
    'bases': '.dat',
    'configs': '.dat',
    'widgets': '.dat',
    'sounds': '.wav',
    'maps': '.dat',
    'music': '.mid',
    'models': '.dat',
    'sprites': '.dat',
    'textures': '.dat',
    'binary': '.dat',
    'jingles': '.ogg',
    'scripts': '.dat',
    'main': '.dat'
};


/**
 * Finds the corresponding string index key for the given numeric id.
 * @param index The numeric index id to find the name of.
 */
export const getIndexId = (index: number): IndexName => {
    const ids: string[] = Object.keys(indexIdMap);
    for(const id of ids) {
        if(indexIdMap[id] === index) {
            return id as IndexName;
        }
    }

    return null;
};


export type FileCompression = 'uncompressed' | 'bzip' | 'gzip';


export const getCompressionKey = (compression: FileCompression) =>
    compression === 'gzip' ? 2 : (compression === 'bzip' ? 1 : 0);


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
    fileExtension: string;
    format?: number;
    settings?: number;
    files: { [key: number]: FileMetadata }; // file index within the archive => IndexedFileEntry
}
