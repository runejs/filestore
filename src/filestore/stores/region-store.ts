import { Filestore } from '../filestore';
import { FileIndex } from '../file-index';
import { logger } from '@runejs/core';


export const maxRegions = 32768;

export class MapTile {
    public x: number;
    public y: number;
    public level: number;
    public height: number;
    public attrOpcode: number;
    public overlayId: number;
    public overlayPath: number;
    public overlayOrientation: number;
    public underlayId: number;
    public bridge: boolean;
    public nonWalkable: boolean;
    private _flags: number = 0;

    public set flags(flags: number) {
        this._flags = flags;
        this.bridge = (this.flags & 0x2) == 0x2;
        this.nonWalkable = (this.flags & 0x1) == 0x1;
    }

    public get flags(): number {
        return this._flags;
    }
}

export interface MapFile {
    fileId: number;
    regionX: number;
    regionY: number;
    tileMap: MapTile[][][];
}

export class LandscapeFile {
    fileId: number;
    regionX: number;
    regionY: number;
}

export class RegionStore {

    private readonly fileStore: Filestore;
    private readonly regionIndex: FileIndex;

    public constructor(fileStore: Filestore) {
        this.fileStore = fileStore;
        this.regionIndex = fileStore.getIndex('regions');
    }

    public decodeLanscapeFile(regionX: number, regionY: number): LandscapeFile | null {
        const landscapeFile = this.regionIndex.getFile(`l${regionX}_${regionY}`);
        if(!landscapeFile) {
            logger.warn(`Landscape file not found for region ${regionX},${regionY}`);
            return null;
        }

        // @TODO parse

        return {
            fileId: landscapeFile.fileId,
            regionX, regionY
        };
    }

    public decodeMapFile(regionX: number, regionY: number): MapFile | null {
        const mapFile = this.regionIndex.getFile(`m${regionX}_${regionY}`);
        if(!mapFile) {
            logger.warn(`Map file not found for region ${regionX},${regionY}`);
            return null;
        }

        const tileMap: MapTile[][][] = new Array(4);
        const buffer = mapFile.content;

        for(let level = 0; level < 4; level++) {
            tileMap[level] = new Array(64);
            for(let x = 0; x < 64; x++) {
                tileMap[level][x] = new Array(64);

                for(let y = 0; y < 64; y++) {
                    const tile = new MapTile();
                    tile.x = x + regionX;
                    tile.y = y + regionY;
                    tile.level = level;

                    while(true) {
                        const opcode = buffer.get('BYTE', 'UNSIGNED');

                        if(opcode === 0) {
                            break;
                        } else if(opcode === 1) {
                            tile.height = buffer.get('BYTE', 'UNSIGNED');
                            break;
                        } else if(opcode <= 49) {
                            tile.attrOpcode = opcode;
                            tile.overlayId = buffer.get('BYTE');
                            tile.overlayPath = (opcode - 2) / 4;
                            tile.overlayOrientation = opcode - 2 & 3;
                        } else if(opcode <= 81) {
                            tile.flags = opcode - 49;
                        } else {
                            tile.underlayId = opcode - 81;
                        }
                    }

                    tileMap[level][x][y] = tile;
                }
            }
        }

        return {
            fileId: mapFile.fileId,
            regionX, regionY, tileMap
        };
    }

}
