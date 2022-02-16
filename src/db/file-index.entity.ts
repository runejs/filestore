import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';

import { IndexEntity } from './index-entity';
import { StoreIndexEntity } from './store-index.entity';
import { ArchiveIndexEntity } from './archive-index.entity';
import { GroupIndexEntity } from './group-index.entity';


@Entity('file_index')
@Index('file_identifier', [ 'key', 'gameVersion', 'archiveKey', 'groupKey' ], { unique: true })
export class FileIndexEntity extends IndexEntity {

    @ManyToOne(() => StoreIndexEntity, store => store.files,
        { primary: true, onDelete: 'CASCADE' })
    @JoinColumn({ name: 'game_version', referencedColumnName: 'gameVersion' })
    store: StoreIndexEntity;

    @ManyToOne(() => ArchiveIndexEntity, archive => archive.groups,
        { primary: true, onDelete: 'CASCADE' })
    @JoinColumn([
        { name: 'archive_key', referencedColumnName: 'key' },
        { name: 'game_version', referencedColumnName: 'gameVersion' }
    ])
    archive: ArchiveIndexEntity;

    @ManyToOne(() => GroupIndexEntity, group => group.files,
        { primary: true, onDelete: 'CASCADE' })
    @JoinColumn([
        { name: 'archive_key', referencedColumnName: 'archiveKey' },
        { name: 'group_key', referencedColumnName: 'key' },
        { name: 'game_version', referencedColumnName: 'gameVersion' }
    ])
    group: GroupIndexEntity;

    @PrimaryColumn('integer', { name: 'game_version', nullable: false, unique: false })
    gameVersion: number;

    @PrimaryColumn('integer', { name: 'archive_key', unique: false, nullable: false })
    archiveKey: number;

    @PrimaryColumn('integer', { name: 'group_key', unique: false, nullable: false })
    groupKey: number;

    @Column('integer', { nullable: false, name: 'stripe_count', default: 1 })
    stripeCount: number = 1;

    @Column('text', { nullable: true, default: null })
    stripes: string | null = null;

}
