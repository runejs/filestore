import { ByteBuffer } from '@runejs/common/buffer';
import { FileProperties } from './file-properties';
import { BinaryFile } from './binary-file';
import { GroupIndex } from './archive-index';
import { join } from 'path';


export class Group extends BinaryFile<GroupIndex> {

    public files: Map<string, BinaryFile>;

    public constructor(index: string | number, properties?: Partial<FileProperties<GroupIndex>>) {
        super(index, properties);
        this.files = new Map<string, BinaryFile>();
    }

    public override compress(): ByteBuffer | null {
        return super.compress();
    }

    public override read(compress: boolean = false): void {
        // @TODO
    }

    public has(fileIndex: string | number): boolean {
        return this.files.has(String(fileIndex));
    }

    public get(fileIndex: string | number): BinaryFile | null {
        return this.files.get(String(fileIndex)) ?? null;
    }

    public set(fileIndex: string | number, file: BinaryFile): void {
        this.files.set(String(fileIndex), file);
    }

    public override get path(): string {
        const archivePath = this.archive?.path || null;
        if(!archivePath) {
            throw new Error(`Error generating group path; Archive path not provided to group ${this.fileKey}.`);
        }

        return join(archivePath, this.name || this.fileKey);
    }

}
