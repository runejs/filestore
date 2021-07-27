import { ByteBuffer } from '@runejs/core/buffer';
import FileCodec from '../file-codec';


export class MapData {

    public tileHeights: Uint8Array[][] = new Array(4);
    public tileSettings: Uint8Array[][] = new Array(4);
    public tileOverlayIds: Int8Array[][] = new Array(4);
    public tileOverlayPaths: Int8Array[][] = new Array(4);
    public tileOverlayOrientations: Int8Array[][] = new Array(4);
    public tileOverlayOpcodes: Uint8Array[][] = new Array(4);
    public tileUnderlayIds: Int8Array[][] = new Array(4);

    public constructor() {
        Object.keys(this).forEach(key => {
            if(!this[key] || !Array.isArray(this[key])) {
                return;
            }

            const tileInfoArray: Uint8Array[][] | Int8Array[][] = this[key];
            for(let plane = 0; plane < 4; plane++) {
                tileInfoArray[plane] = new Array(64);
                for(let x = 0; x < 64; x++) {
                    tileInfoArray[plane][x] = (tileInfoArray instanceof Uint8Array) ?
                        new Uint8Array(64) : new Int8Array(64);
                }
            }
        });
    }

    /**
     * Iterates over each individual tile space within this map file, calling the provided callback
     * function with the plane index, x coordinate, and y coordinate of the current tile in the loop.
     * @param callback The function to be called for each individual map tile.
     */
    public forEach(callback: (mapData: MapData, plane: number, x: number, y: number) => void): MapData {
        for(let plane = 0; plane < 4; plane++) {
            for(let x = 0; x < 64; x++) {
                for(let y = 0; y < 64; y++) {
                    callback(this, plane, x, y);
                }
            }
        }

        return this;
    }

}


export default {
    archive: 'maps',
    revision: '414-458',

    decode: (buffer: ByteBuffer) => {
        buffer.readerIndex = 0;

        const mapData = new MapData().forEach((mapData, plane, x, y) => {
            while(true) {
                const opcode = buffer.get('byte', 'unsigned');

                if(opcode === 0) {
                    break;
                } else if(opcode === 1) {
                    mapData.tileHeights[plane][x][y] = buffer.get('byte', 'unsigned');
                    break;
                } else if(opcode <= 49) {
                    mapData.tileOverlayIds[plane][x][y] = buffer.get('byte');
                    mapData.tileOverlayPaths[plane][x][y] = (opcode - 2) / 4;
                    mapData.tileOverlayOrientations[plane][x][y] = opcode - 2 & 3;
                    mapData.tileOverlayOpcodes[plane][x][y] = opcode;
                } else if(opcode <= 81) {
                    mapData.tileSettings[plane][x][y] = opcode - 49;
                } else {
                    mapData.tileUnderlayIds[plane][x][y] = opcode - 81;
                }
            }
        });

        return JSON.stringify(mapData, null, 4);
    },

    encode: (mapDataFile: string) => {
        const mapData: MapData = JSON.parse(mapDataFile);

        const buffer = new ByteBuffer(100000);

        mapData.forEach((mapData, plane, x, y) => {
            const tileOverlayId = mapData.tileOverlayIds[plane][x][y];
            const tileOverlayOpcode = mapData.tileOverlayOpcodes[plane][x][y];
            const tileSetting = mapData.tileSettings[plane][x][y];
            const tileUnderlayId = mapData.tileUnderlayIds[plane][x][y];

            if(tileOverlayOpcode > 1) {
                buffer.put(tileOverlayOpcode);
                buffer.put(tileOverlayId, 'byte');
            }

            if(tileSetting > 0) {
                buffer.put(49 + tileSetting, 'byte');
            }

            if(tileUnderlayId > 0) {
                buffer.put(81 + tileUnderlayId, 'byte');
            }

            // Final byte for this tile
            const tileHeight = mapData.tileHeights[plane][x][y];
            if(tileHeight > 0) {
                buffer.put(1, 'byte');
                buffer.put(tileHeight, 'byte');
            } else {
                buffer.put(0, 'byte');
            }
        });

        return buffer.flipWriter();
    }
} as FileCodec;
