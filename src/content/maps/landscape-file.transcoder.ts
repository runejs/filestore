import { GroupTranscoder } from '../group-transcoder';
import { LandscapeFile } from './landscape-file';
import { ByteBuffer } from '@runejs/common';


export class LandscapeFileTranscoder extends GroupTranscoder<LandscapeFile> {

    public override decodeGroup(groupKey: number): LandscapeFile | null;
    public override decodeGroup(groupName: string): LandscapeFile | null;
    public override decodeGroup(groupKeyOrName: number | string): LandscapeFile | null {
        const group = this.findGroup(groupKeyOrName);
        const landscapeFileKey = group.numericKey;
        const landscapeFileName = group.name;
        const landscapeFile = new LandscapeFile(landscapeFileKey, landscapeFileName);
        this.decodedGroups.set(landscapeFileKey, landscapeFile);

        // @todo decode the binary file data
        
        return landscapeFile;
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
