import { CompressionMethod } from '@runejs/common/compress';
import { EncryptionMethod } from '@runejs/common/encrypt';
import { Archive, FileIndex, Group, Store } from './index';
import { setObjectProps } from '@runejs/common/util';


export class FileProperties<T extends FileIndex = FileIndex> {
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

        if(properties.fileIndex) {
            this.fileIndex = properties.fileIndex;
        }
    }

    public get numericKey(): number {
        return Number(this.fileKey);
    }
}

export interface ArchiveProperties {
    index: number;
    name: string;
    format?: number;
    versioned?: boolean;
    compression?: CompressionMethod;
    encryption?: EncryptionMethod;
    encryptionPattern?: string | undefined;
    contentType?: string;
    saveFileNames?: boolean;
    defaultFileNames?: { [key: string]: number };
}
