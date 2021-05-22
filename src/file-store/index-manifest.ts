/**
 * String representations of numeric index ids.
 */
export type IndexName = 'configs' | 'sprites' | 'music' | 'jingles' | 'sounds' | 'binary' |
    'widgets' | 'regions' | 'models' | 'textures' | 'scripts' | 'frames' | 'skeletons';


/**
 * A map of unique index keys to numeric ids.
 */
export const indexIdMap: { [key: string]: number } = {
    'skeletons': 0,
    'frames': 1,
    'configs': 2,
    'widgets': 3,
    'sounds': 4,
    'regions': 5,
    'music': 6,
    'models': 7,
    'sprites': 8,
    'textures': 9,
    'binary': 10,
    'jingles': 11,
    'scripts': 12
};


export const fileExtensions: { [key: string]: string } = {
    'skeletons': '.dat',
    'frames': '.dat',
    'configs': '.dat',
    'widgets': '.dat',
    'sounds': '.wav',
    'regions': '.dat',
    'music': '.mid',
    'models': '.dat',
    'sprites': '.dat',
    'textures': '.dat',
    'binary': '.dat',
    'jingles': '.ogg',
    'scripts': '.dat'
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


export interface IndexedFileEntry {
    file: string;
    version?: number;
}

export interface IndexManifest {

    indexId: number;
    name: IndexName;
    fileCompression: FileCompression;
    format?: number;
    version?: number;
    files: { [key: number]: IndexedFileEntry }; // file index within the archive => IndexedFileEntry

}
