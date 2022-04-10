import { ByteBuffer } from '@runejs/common';
import { Group } from '../group';


export abstract class FlatFileTranscoder<T = ByteBuffer> {

    public readonly group: Group;
    public readonly decodedFiles = new Map<number, T>();

    protected constructor(group: Group) {
        this.group = group;
    }

    public abstract decodeFile(fileKey: number): T | null;

    public abstract encodeFile(fileKey: number): ByteBuffer | null;

}
