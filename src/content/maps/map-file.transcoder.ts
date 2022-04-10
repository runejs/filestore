import { GroupTranscoder } from '../group-transcoder';
import { MapFile } from './map-file';
import { ByteBuffer } from '@runejs/common';


export class MapFileTranscoder extends GroupTranscoder<MapFile> {

    public override decodeGroup(groupKey: number): MapFile | null;
    public override decodeGroup(groupName: string): MapFile | null;
    public override decodeGroup(groupKeyOrName: number | string): MapFile | null {
        const group = this.findGroup(groupKeyOrName);
        const mapFileKey = group.numericKey;
        const mapFileName = group.name;
        const mapFile = new MapFile(mapFileKey, mapFileName);
        this.decodedGroups.set(mapFileKey, mapFile);

        // @todo decode the binary file data

        return mapFile;
    }

    public override encodeGroup(groupKey: number): ByteBuffer | null;
    public override encodeGroup(groupName: string): ByteBuffer | null;
    public override encodeGroup(groupKeyOrName: number | string): ByteBuffer | null {
        const group = this.findGroup(groupKeyOrName);
        const decodedGroup = this.decodedGroups.get(group.numericKey) || null;

        // @todo encode the decodedGroup back into binary format

        return null;
    }

}
