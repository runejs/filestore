import { ArchiveTranscoder } from '../archive-transcoder';
import { MapFile } from './map-file';
import { ByteBuffer } from '@runejs/common';


export class MapFileTranscoder extends ArchiveTranscoder<MapFile> {

    override decodeGroup(groupKey: number): MapFile | null;
    override decodeGroup(groupName: string): MapFile | null;
    override decodeGroup(groupKeyOrName: number | string): MapFile | null {
        const {
            numericKey: mapFileKey,
            name: mapFileName,
            data: fileData
        } = this.findGroup(groupKeyOrName);

        const mapFile = new MapFile(mapFileKey, mapFileName);
        this.decodedGroups.set(mapFileKey, mapFile);

        for(let level = 0; level < 4; level++) {
            for(let x = 0; x < 64; x++) {
                for(let y = 0; y < 64; y++) {
                    mapFile.tiles.settings[level][x][y] = 0;

                    let runLoop = true;

                    while(runLoop) {
                        const dataOpcode = fileData.get('byte', 'UNSIGNED');

                        if(dataOpcode === 0) {
                            runLoop = false;
                            break;
                        } else if(dataOpcode === 1) {
                            mapFile.tiles.heights[level][x][y] = fileData.get('byte', 'u');
                            runLoop = false;
                            break;
                        } else if(dataOpcode <= 49) {
                            mapFile.tiles.overlayIds[level][x][y] = fileData.get('byte');
                            mapFile.tiles.overlayPaths[level][x][y] = (dataOpcode - 2) / 4;
                            mapFile.tiles.overlayOrientations[level][x][y] = dataOpcode - 2 & 3;
                        } else if(dataOpcode <= 81) {
                            mapFile.tiles.settings[level][x][y] = dataOpcode - 49;
                        } else {
                            mapFile.tiles.underlayIds[level][x][y] = dataOpcode - 81;
                        }
                    }
                }
            }
        }

        return mapFile;
    }

    override encodeGroup(groupKey: number): ByteBuffer | null;
    override encodeGroup(groupName: string): ByteBuffer | null;
    override encodeGroup(groupKeyOrName: number | string): ByteBuffer | null {
        const group = this.findGroup(groupKeyOrName);
        const decodedGroup = this.decodedGroups.get(group.numericKey) || null;

        // @todo encode the decodedGroup back into binary format

        return null;
    }

}
