import { ByteBuffer } from '@runejs/common';
import { Archive } from '../archive';


export abstract class GroupTranscoder<T = ByteBuffer> {

    public readonly archive: Archive;
    public readonly decodedGroups = new Map<number, T>();

    protected constructor(archive: Archive) {
        this.archive = archive;
    }

    public abstract decodeGroup(groupKey: number): T | null;

    public abstract encodeGroup(groupKey: number): ByteBuffer | null;

}
