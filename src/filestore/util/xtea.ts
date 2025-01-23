import type { XteaDefinition } from '../stores';
import { loadConfigurationFiles } from '@runejs/common/fs';

export type XteaRegionMap = { [key: number]: XteaRegion };

export class XteaRegion implements XteaDefinition {
    public mapsquare: number;
    public key: [number, number, number, number];
    public archive: number;
    public group: number;
    public name: string;
    public name_hash: number;

    public constructor(
        mapsquare: number,
        key: [number, number, number, number],
        archive: number,
        group: number,
        name: string,
        name_hash: number,
    ) {
        this.mapsquare = mapsquare;
        this.key = key;
        this.archive = archive;
        this.group = group;
        this.name = name;
        this.name_hash = name_hash;
    }
}

export const createXteaRegion = (config: XteaDefinition): XteaRegion =>
    new XteaRegion(
        config.mapsquare,
        config.key,
        config.archive,
        config.group,
        config.name,
        config.name_hash,
    );

export const loadXteaRegionFiles = async (
    path: string,
): Promise<XteaRegionMap> => {
    const regions: XteaRegionMap = {};
    const files = await loadConfigurationFiles<XteaDefinition[]>(path);
    for (const file of files) {
        for (const region of file) {
            const xteaRegion = createXteaRegion(region);
            regions[xteaRegion.name] = xteaRegion;
        }
    }
    return regions;
};
