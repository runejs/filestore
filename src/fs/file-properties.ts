import { CompressionMethod } from '@runejs/common/compress';
import { EncryptionMethod } from '@runejs/common/encrypt';
import { Archive, FileIndex, Group, Store } from './index';
import { setObjectProps } from '@runejs/common/util';


export class FileProperties {
    key: string;
    index: FileIndex;

    store: Store | null = null;
    archive: Archive | null = null;
    group: Group | null = null;

    encryption: EncryptionMethod | [ EncryptionMethod, string ] = 'none';
    encrypted: boolean = false;
    compression: CompressionMethod = 'none';
    compressed: boolean = false;

    name: string = '';
    nameHash: number = -1;
    version: number = 0;
    size: number = 0;
    stripes: number[] = [];
    crc32: number = -1;
    sha256: string = '';

    public constructor(properties?: Partial<FileProperties>) {
        setObjectProps<FileProperties>(this, properties);

        if(properties.index) {
            this.index = properties.index;
        }
    }

    public get numericKey(): number {
        return Number(this.key);
    }

    public get hasNameHash(): boolean {
        return this.nameHash !== undefined && this.nameHash !== null && this.nameHash !== -1 && !isNaN(this.nameHash);
    }
}

export interface ArchiveProperties {
    index: number;
    name: string;
    format?: number;
    versioned?: boolean;
    compression?: CompressionMethod;
    encryption?: EncryptionMethod | [ EncryptionMethod, string ];
    contentType?: string;
    filesNamed?: boolean;
    groupNames?: { [key: string]: number };
}
