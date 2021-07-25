require('json5/lib/register');


export type ArchiveName =
    'animations' |
    'bases' |
    'configs' |
    'widgets' |
    'sounds' |
    'maps' |
    'music' |
    'models' |
    'sprites' |
    'textures' |
    'binary' |
    'jingles' |
    'scripts';

export type IndexName = 'main' | ArchiveName;


export type FileCompression = 'uncompressed' | 'bzip' | 'gzip';

export const compressionKey: { [key in FileCompression]: number } = {
    uncompressed: 0,
    bzip: 1,
    gzip: 2
};

export interface ArchiveConfig {
    index: number;
    compression: FileCompression;
    fileExtension?: string;
    flattenFileGroups?: boolean;
    children?: { [key: string]: number };
}

export type ArchiveConfigurations = { [key in IndexName]: ArchiveConfig };

export const archiveConfig: ArchiveConfigurations = require('../../../config/archives.json5');


export const getIndexName = (indexId: number): IndexName | undefined => {
    return Object.keys(archiveConfig).find(key => key && archiveConfig[key]?.index === indexId) as IndexName | undefined;
};

export const getArchiveConfig = (indexId: number): ArchiveConfig | undefined => {
    const indexName = getIndexName(indexId);
    if(!indexName) {
        return undefined;
    }
    return archiveConfig[indexName as IndexName];
};
