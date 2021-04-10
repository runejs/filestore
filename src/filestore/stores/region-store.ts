import { logger } from '@runejs/core';
import { readFileSync } from 'fs';
import path from 'path';

import { Filestore } from '../filestore';
import { FileIndex } from '../file-index';
import { hash } from '../util';


export const maxRegions = 32768;


export interface MapFile {
    fileId: number;
    regionX: number;
    regionY: number;
    tileHeights: number[][][];
    tileSettings: Uint8Array[][];
    tileOverlayIds: Uint8Array[][];
    tileOverlayPaths: Uint8Array[][];
    tileOverlayOrientations: Uint8Array[][];
    tileUnderlayIds: Uint8Array[][];
}

export interface LandscapeObject {
    objectId: number;
    x: number;
    y: number;
    level: number;
    type: number;
    orientation: number;
}

export interface LandscapeFile {
    fileId: number;
    regionX: number;
    regionY: number;
    landscapeObjects: LandscapeObject[];
}

export interface Region {
    regionX: number;
    regionY: number;
    mapFile: MapFile;
    landscapeFile: LandscapeFile | null;
}

export interface XteaDefinition {
    archive: number;
    group: number;
    name_hash: number;
    name: string;
    mapsquare: number;
    key: number[];
}

export class RegionStore {

    public readonly xteas: { [key: number]: XteaDefinition } = {};

    private readonly regionIndex: FileIndex;

    public constructor(private fileStore: Filestore, xteas?: { [p: number]: XteaDefinition }) {
        this.regionIndex = this.fileStore.getIndex('regions');
        if(xteas) {
            this.xteas = xteas;
            return
        } else {
            const array = JSON.parse(readFileSync(path.join(this.fileStore.configDir, 'map-keys.json'), 'utf8'));
            for(let i = 0; i < array.length; i++) {
                const object: XteaDefinition = array[i];
                this.xteas[object.name_hash] = object;
            }
        }
    }

    public getMapKeys(regionX: number, regionY: number): number[] {
        const fileNameHash = hash(`l${regionX}_${regionY}`);
        return this.xteas[fileNameHash]?.key || [0, 0, 0, 0];
    }

    public getRegion(regionX: number, regionY: number): Region | null {
        const mapFile = this.getMapFile(regionX, regionY);
        if(!mapFile) {
            return null;
        }

        const landscapeFile = this.getLandscapeFile(regionX, regionY) || null;

        return { regionX, regionY, mapFile, landscapeFile };
    }

    public getLandscapeFile(regionX: number, regionY: number): LandscapeFile | null {
        const keys = this.getMapKeys(regionX, regionY);

        const landscapeFile = this.regionIndex.getFile(`l${regionX}_${regionY}`, keys);
        if(!landscapeFile) {
            logger.warn(`Landscape file not found for region ${regionX},${regionY}`);
            return null;
        }

        const landscapeObjects = [];

        let objectId = -1;
        landscapeFile.content.readerIndex = 0;

        while(true) {
            const objectIdOffset = landscapeFile.content.get('SMART');

            if(objectIdOffset === 0) {
                break;
            }

            objectId += objectIdOffset;
            let objectPositionInfo = 0;

            while(true) {
                const objectPositionInfoOffset = landscapeFile.content.get('SMART');

                if(objectPositionInfoOffset === 0) {
                    break;
                }

                objectPositionInfo += objectPositionInfoOffset - 1;

                const worldX = (regionX & 0xff) * 64;
                const worldY = regionY * 64;
                const x = (objectPositionInfo >> 6 & 0x3f) + worldX;
                const y = (objectPositionInfo & 0x3f) + worldY;
                const level = objectPositionInfo >> 12 & 0x3;
                const objectMetadata = landscapeFile.content.get('BYTE', 'UNSIGNED');
                const type = objectMetadata >> 2;
                const orientation = objectMetadata & 0x3;

                landscapeObjects.push({ objectId, x, y, level, type, orientation });
            }
        }

        return {
            fileId: landscapeFile.fileId,
            regionX, regionY,
            landscapeObjects
        };
    }

    public getMapFile(regionX: number, regionY: number): MapFile | null {
        const mapFile = this.regionIndex.getFile(`m${regionX}_${regionY}`);
        if(!mapFile) {
            logger.warn(`Map file not found for region ${regionX},${regionY}`);
            return null;
        }

        const tileHeights: number[][][] = new Array(4);
        const tileSettings: Uint8Array[][] = new Array(4);
        const tileOverlayIds: Uint8Array[][] = new Array(4);
        const tileOverlayPaths: Uint8Array[][] = new Array(4);
        const tileOverlayOrientations: Uint8Array[][] = new Array(4);
        const tileUnderlayIds: Uint8Array[][] = new Array(4);

        const arrays = [ tileHeights, tileSettings, tileOverlayIds, tileOverlayPaths,
            tileOverlayOrientations, tileUnderlayIds ];
        arrays.forEach(tileArray => {
            tileArray.fill(new Array(64));
            tileArray.forEach(xArr => {
                xArr.fill(new Array(64));
            });
        });

        const buffer = mapFile.content;

        for(let level = 0; level < 4; level++) {
            for(let x = 0; x < 64; x++) {
                for(let y = 0; y < 64; y++) {
                    while(true) {
                        const opcode = buffer.get('BYTE', 'UNSIGNED');

                        if(opcode === 0) {
                            break;
                        } else if(opcode === 1) {
                            tileHeights[level][x][y] = buffer.get('BYTE', 'UNSIGNED');
                            break;
                        } else if(opcode <= 49) {
                            tileOverlayIds[level][x][y] = buffer.get('BYTE');
                            tileOverlayPaths[level][x][y] = (opcode - 2) / 4;
                            tileOverlayOrientations[level][x][y] = opcode - 2 & 3;
                        } else if(opcode <= 81) {
                            tileSettings[level][x][y] = opcode - 49;
                        } else {
                            tileUnderlayIds[level][x][y] = opcode - 81;
                        }
                    }
                }
            }
        }

        return {
            fileId: mapFile.fileId,
            regionX, regionY,
            tileHeights, tileOverlayIds, tileOverlayOrientations,
            tileOverlayPaths, tileSettings, tileUnderlayIds
        };
    }

}
