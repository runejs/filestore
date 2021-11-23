import { FileCompression } from '@runejs/common/compression';
import { EncryptionMethod } from '../config';


export interface FileOptions {
    encryption?: EncryptionMethod;
    compression?: FileCompression;
    encrypted?: boolean;
    compressed?: boolean;
}
