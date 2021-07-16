import { ByteBuffer } from '@runejs/core/buffer';
import FileCodec from '../file-codec';
import MapData from './map-data';


const codec: FileCodec<MapData> = {
    fileType: 'map',

    revision: '414-458',

    decode: (buffer: ByteBuffer): MapData => {
        buffer.readerIndex = 0;

        return new MapData().forEach((mapData, plane, x, y) => {
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
    },

    encode: (mapData: MapData): ByteBuffer => {
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
};


export default codec;
