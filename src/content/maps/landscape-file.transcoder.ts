import { ArchiveTranscoder } from '../archive-transcoder';
import { LandscapeFile, LandscapeObject } from './landscape-file';
import { ByteBuffer } from '@runejs/common';


export class LandscapeFileTranscoder extends ArchiveTranscoder<LandscapeFile> {

    override decodeGroup(groupKey: number): LandscapeFile | null;
    override decodeGroup(groupName: string): LandscapeFile | null;
    override decodeGroup(groupKeyOrName: number | string): LandscapeFile | null {
        const group = this.findGroup(groupKeyOrName);
        if(!group) {
            return null;
        }

        const {
            numericKey: landscapeFileKey,
            name: landscapeFileName,
            data: fileData
        } = group;

        const landscapeFile = new LandscapeFile(landscapeFileKey, landscapeFileName);
        this.decodedGroups.set(landscapeFileKey, landscapeFile);

        let gameObjectKey = -1;
        let objectKeyLoop = true;

        while(objectKeyLoop) {
            const objectKeyAccumulator = fileData.get('smart_short');

            if(objectKeyAccumulator === 0) {
                objectKeyLoop = false;
                break;
            }

            gameObjectKey += objectKeyAccumulator;
            let objectCoords = 0;

            let objectLocationsLoop = true;

            while(objectLocationsLoop) {
                const objectCoordsAccumulator = fileData.get('smart_short');

                if(objectCoordsAccumulator === 0) {
                    objectLocationsLoop = false;
                    break;
                }

                objectCoords += objectCoordsAccumulator - 1;

                const objectMetadata = fileData.get('byte', 'u');
                const mapWorldX = (landscapeFile.x & 0xff) * 64;
                const mapWorldY = landscapeFile.y * 64;

                landscapeFile.objects.push(new LandscapeObject(gameObjectKey,
                    (objectCoords >> 6 & 0x3f) + mapWorldX, (objectCoords & 0x3f) + mapWorldY,
                    objectCoords >> 12 & 0x3, objectMetadata >> 2, objectMetadata & 0x3));
            }
        }

        return landscapeFile;
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
