import { CompressionMethod } from '@runejs/common/compress';
import { EncryptionMethod } from '@runejs/common/encrypt';


export interface ArchiveConfig {
    index: number;
    name: string;
    versioned?: boolean;
    compression?: CompressionMethod;
    encryption?: EncryptionMethod | [ EncryptionMethod, string ];
    contentType?: string;
    filesNamed?: boolean;
    flatten?: boolean;
    groupNames?: { [key: string]: number };
    build?: number;
}
