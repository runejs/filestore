import { EncryptionMethod } from '@runejs/common/encrypt';


export interface ArchiveConfig {
    key: number;
}


export interface JS5ArchiveConfig extends ArchiveConfig {
    encryption?: [ EncryptionMethod, string ];
    contentType?: string;
    flattenGroups?: boolean;
    groupNames?: { [key: string]: number };
}
