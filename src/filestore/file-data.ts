import { ByteBuffer } from '@runejs/core';


export class FileData {

    public readonly fileId: number;
    public nameHash: number;
    public content: ByteBuffer;

    public constructor(fileId: number, nameHash?: number, content?: ByteBuffer) {
        this.fileId = fileId;
        this.nameHash = nameHash;
        this.content = content;
    }

}
