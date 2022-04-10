import { ByteBuffer } from '@runejs/common';
import { Archive } from '../archive';
import { Group } from '../group';


export abstract class GroupTranscoder<T = ByteBuffer> {

    public readonly archive: Archive;
    public readonly decodedGroups = new Map<number, T>();

    protected constructor(archive: Archive) {
        this.archive = archive;
    }

    public abstract decodeGroup(groupKeyOrName: number | string): T | null;

    public abstract encodeGroup(groupKeyOrName: number | string): ByteBuffer | null;

    protected findGroup(groupKeyOrName: number | string): Group | null {
        if(typeof groupKeyOrName === 'string') {
            return (this.archive.find(groupKeyOrName) as Group) || null;
        } else {
            return this.archive.get(groupKeyOrName) || null;
        }
    }

}
