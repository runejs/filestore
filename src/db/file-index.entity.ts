import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';

import { IndexEntity } from './index-entity';
import { StoreIndexEntity } from './store-index.entity';
import { ArchiveIndexEntity } from './archive-index.entity';
import { GroupIndexEntity } from './group-index.entity';


@Entity('file_index')
@Index('file_identifier', [ 'key', 'gameBuild', 'archiveKey', 'groupKey' ], { unique: true })
export class FileIndexEntity extends IndexEntity {

    @PrimaryColumn('text', { name: 'game_build', nullable: false, unique: false })
    gameBuild: string;

    @PrimaryColumn('integer', { name: 'archive_key', unique: false, nullable: false })
    archiveKey: number;

    @PrimaryColumn('integer', { name: 'group_key', unique: false, nullable: false })
    groupKey: number;

    @Column('integer', { name: 'name_hash', nullable: true, default: 0 })
    nameHash: number = 0;

    @Column('integer', { nullable: false, default: 0 })
    version: number = 0;

    @Column('integer', { name: 'stripe_count', nullable: false, default: 1 })
    stripeCount: number = 1;

    @Column('text', { nullable: true, default: null })
    stripes: string | null = null;

    @ManyToOne(() => StoreIndexEntity, async store => store.files,
        { primary: true, onDelete: 'CASCADE' })
    @JoinColumn({ name: 'game_build', referencedColumnName: 'gameBuild' })
    store: StoreIndexEntity;

    @ManyToOne(() => ArchiveIndexEntity, async archive => archive.groups,
        { primary: true, onDelete: 'CASCADE' })
    @JoinColumn([
        { name: 'archive_key', referencedColumnName: 'key' },
        { name: 'game_build', referencedColumnName: 'gameBuild' }
    ])
    archive: ArchiveIndexEntity;

    @ManyToOne(() => GroupIndexEntity, async group => group.files,
        { primary: true, onDelete: 'CASCADE' })
    @JoinColumn([
        { name: 'archive_key', referencedColumnName: 'archiveKey' },
        { name: 'group_key', referencedColumnName: 'key' },
        { name: 'game_build', referencedColumnName: 'gameBuild' }
    ])
    group: GroupIndexEntity;

}
