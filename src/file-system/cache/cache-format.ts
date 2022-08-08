import { CacheFile } from './cache-file';


export const getCacheFormat = (cacheFiles: CacheFile[]): 'jag' | 'js5' | 'unknown' => {
    if (cacheFiles.find(file => file.name === 'main_file_cache.idx255')) {
        return 'js5';
    } else if (cacheFiles.find(file => file.name === 'main_file_cache.dat')) {
        return 'jag';
    }

    return 'unknown';
};
