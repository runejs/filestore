import axios from 'axios';
import AdmZip from 'adm-zip';
import { Buffer } from 'buffer';
import { logger } from '@runejs/common';
import { XteaConfig } from '@runejs/common/encrypt';
import { PackedCacheFile } from '../file-system/packed';


const openRS2Endpoint = 'https://archive.openrs2.org';


export interface OpenRS2BuildNumber {
    major: number;
    minor: number | null;
}


export interface OpenRS2Cache {
    id: number;
    scope: 'runescape' | string;
    game: 'runescape' | 'darkscape' | string;
    environment: 'live' | 'beta' | string;
    language: 'en' | 'de' | 'fr' | 'pt' | string;
    builds: OpenRS2BuildNumber[];
    timestamp: Date; // ISO 8601 format
    sources: string[];
    valid_indexes: number | null;
    indexes: number | null;
    valid_groups: number | null;
    groups: number | null;
    valid_keys: number | null;
    keys: number | null;
    size: number | null;
    blocks: number | null;
    disk_store_valid: boolean | null;
}


export const getOpenRS2CacheList = async (): Promise<OpenRS2Cache[]> => {
    const response = await axios.get<OpenRS2Cache[]>(
        `${ openRS2Endpoint }/caches.json`
    );
    return response.data;
};


export const getAvailableBuilds = async (
    scope: string = 'runescape',
    game: string = 'runescape'
): Promise<number[]> => {
    const cacheList = (await getOpenRS2CacheList())
        .filter(cacheDetails =>
            // Filter out caches by desired scope and game
            cacheDetails.scope === scope && cacheDetails.game === game
        )
        .map(cacheDetails => {
            // Map cache list to a list of build numbers

            if (!cacheDetails?.builds?.length) {
                return [ -1 ];
            }

            // Map the build number arrays to actual numbers
            return cacheDetails.builds.map(build => {
                if (!build) {
                    return -1;
                }

                if (build.minor !== null && build.minor > 0) {
                    return parseFloat(build.major + '.' + build.minor);
                } else {
                    return build.major;
                }
            });
        })
        // Flatten the array
        .flat()
        // Filter out anything less than or equal to 0
        .filter(buildNumber => buildNumber > 0)
        // Sort the list of numbers
        .sort((a, b) => a - b);

    // Remove any duplicates
    return [ ...new Set(cacheList) ];
};


export const getOpenRS2CacheDetailsByBuild = async (
    build: number,
): Promise<OpenRS2Cache | null> => {
    return (await getOpenRS2CacheList())?.find(
        c => c.scope === 'runescape' && c.game === 'runescape' && c.builds.find(b => b.major === build)
    ) || null;
};


export const getOpenRS2CacheFilesById = async (
    id: number,
    scope: string = 'runescape'
): Promise<PackedCacheFile[]> => {
    const response = await axios.get(
        `${ openRS2Endpoint }/caches/${ scope }/${ id }/disk.zip`,
        { responseType: 'arraybuffer' }
    );

    if (!response?.data) {
        return [];
    }

    const zip = new AdmZip(Buffer.from(response.data, 'binary'));
    return zip.getEntries().map(entry => ({
        name: entry.name,
        data: entry.getData()
    }));
};


export const getOpenRS2CacheFilesByBuild = async (
    build: number
): Promise<PackedCacheFile[] | null> => {
    logger.info(`Searching OpenRS2 for build ${ build }...`);

    const cacheList = (await getOpenRS2CacheList())
        ?.filter(c => c.scope === 'runescape' && c.game === 'runescape') || [];

    const desiredCacheInfo = cacheList.find(cacheDetails => {
        for (const b of cacheDetails.builds) {
            if (b.major === build) {
                return true;
            }
        }

        return false;
    });

    if (desiredCacheInfo) {
        logger.info(`Build ${ build } was found within the OpenRS2 archive, fetching data...`);

        const cacheFiles = await getOpenRS2CacheFilesById(desiredCacheInfo.id);
        return cacheFiles?.length ? cacheFiles : null;
    } else {
        logger.error(`Build ${ build } was not found within the OpenRS2.org archive.`);
    }

    return null;
};


export const getXteaKeysById = async (
    id: number,
    scope: string = 'runescape'
): Promise<XteaConfig[]> => {
    const response = await axios.get<XteaConfig[]>(
        `${ openRS2Endpoint }/caches/${ scope }/${ id }/keys.json`
    );

    return response?.data || [];
};


export const getXteaKeysByBuild = async (
    build: number
): Promise<XteaConfig[]> => {
    const cacheDetails = await getOpenRS2CacheDetailsByBuild(build);
    if (!cacheDetails) {
        return [];
    }

    return await getXteaKeysById(cacheDetails.id, cacheDetails.scope);
};
