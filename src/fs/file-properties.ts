import { CompressionMethod } from '@runejs/common/compress';
import { EncryptionMethod } from '@runejs/common/encrypt';
import { Archive, FileIndex, Group, IndexBase, Store } from './index';
import { setObjectProps } from '@runejs/common/util';


export class FileProperties<T extends IndexBase = FileIndex> {
    fileKey: string;
    fileIndex: T;

    store: Store | null = null;
    archive: Archive | null = null;
    group: Group | null = null;

    encryption: EncryptionMethod = 'none';
    encrypted: boolean = false;
    compression: CompressionMethod = 'none';
    compressed: boolean = false;

    name: string = '';
    nameHash: number = -1;
    version: number = 0;
    size: number = 0;
    stripeCount: number = 0;
    stripeSizes: number[] = [];
    crc32: number = -1;
    sha256: string = '';

    public constructor(properties?: Partial<FileProperties<T>>) {
        setObjectProps<FileProperties<T>>(this, properties);
    }

    public get numericKey(): number {
        return Number(this.fileKey);
    }
}
