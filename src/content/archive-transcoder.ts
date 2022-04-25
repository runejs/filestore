import { ByteBuffer } from '@runejs/common';
import { Archive } from '../archive';
import { Group } from '../group';


export interface IArchiveTranscoder<G = ByteBuffer, F = any> {
    archive: Archive;
    decodedGroups: Map<number, G>;
    decodedFlatFiles: Map<number, F[]>;

    decodeGroup(groupKey: number): G | null;
    decodeGroup(groupName: string): G | null;
    decodeGroup(groupKeyOrName: number | string): G | null;

    encodeGroup(groupKey: number): ByteBuffer | null;
    encodeGroup(groupName: string): ByteBuffer | null;
    encodeGroup(groupKeyOrName: number | string): ByteBuffer | null;

    decodeFlatFile(groupKey: number, flatFileKey: number): F | null;
    decodeFlatFile(groupName: string, flatFileKey: number): F | null;
    decodeFlatFile(groupKeyOrName: number | string, flatFileKey: number): F | null;

    encodeFlatFile(groupKey: number, flatFileKey: number): ByteBuffer | null;
    encodeFlatFile(groupName: string, flatFileKey: number): ByteBuffer | null;
    encodeFlatFile(groupKeyOrName: number | string, flatFileKey: number): ByteBuffer | null;
}


export abstract class ArchiveTranscoder<G = ByteBuffer, F = any> implements IArchiveTranscoder<G, F> {

    readonly archive: Archive;
    readonly decodedGroups = new Map<number, G>();
    readonly decodedFlatFiles = new Map<number, F[]>();

    constructor(archive: Archive) {
        this.archive = archive;
    }

    abstract decodeGroup(groupKeyOrName: number | string): G | null;

    abstract encodeGroup(groupKeyOrName: number | string): ByteBuffer | null;

    decodeFlatFile(groupKey: number, flatFileKey: number): F | null;
    decodeFlatFile(groupName: string, flatFileKey: number): F | null;
    decodeFlatFile(groupKeyOrName: string | number, flatFileKey: number): F | null;
    decodeFlatFile(groupKeyOrName: string | number, flatFileKey: number): F | null {
        return null;
    }

    encodeFlatFile(groupKey: number, flatFileKey: number): ByteBuffer | null;
    encodeFlatFile(groupName: string, flatFileKey: number): ByteBuffer | null;
    encodeFlatFile(groupKeyOrName: string | number, flatFileKey: number): ByteBuffer | null;
    encodeFlatFile(groupKeyOrName: string | number, flatFileKey: number): ByteBuffer | null {
        return null;
    }

    protected findGroup(groupKeyOrName: number | string): Group | null {
        if (typeof groupKeyOrName === 'string') {
            return (this.archive.find(groupKeyOrName) as Group) || null;
        } else {
            return this.archive.get(groupKeyOrName) || null;
        }
    }

}
