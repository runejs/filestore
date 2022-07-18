import { EncryptionMethod } from '@runejs/common/encrypt';


export interface JS5ArchiveConfig {
    key: number;
    encryption?: [ EncryptionMethod, string ];
    contentType?: string;
    flatten?: boolean;
    groupNames?: { [key: string]: number };
    build?: number;
}


export interface JagCacheArchiveConfig {
    key: number;
}
