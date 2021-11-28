import { CompressionMethod } from '@runejs/common/compress';
import { EncryptionMethod } from '@runejs/common/encrypt';


export interface ArchiveProperties {
    index: number;
    name: string;
    format?: number;
    versioned?: boolean;
    compression?: CompressionMethod;
    encryption?: EncryptionMethod;
    fileExtension?: string;
    saveFileNames?: boolean;
    defaultFileNames?: { [key: string]: number };
}
