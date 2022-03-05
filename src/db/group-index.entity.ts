import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryColumn } from 'typeorm';
import { FileIndexEntity } from './file-index.entity';
import { ArchiveIndexEntity } from './archive-index.entity';
import { IndexEntity } from './index-entity';
import { StoreIndexEntity } from './store-index.entity';


@Entity('group_index')
@Index('group_identifier', [ 'key', 'gameVersion', 'archiveKey' ], { unique: true })
export class GroupIndexEntity extends IndexEntity {

    @Column('integer', { name: 'name_hash', nullable: true, default: 0 })
    nameHash: number = 0;

    @Column('integer', { nullable: false, default: 0 })
    version: number = 0;

    @ManyToOne(() => StoreIndexEntity, async store => store.groups,
        { primary: true, onDelete: 'CASCADE' })
    @JoinColumn({ name: 'game_version', referencedColumnName: 'gameVersion' })
    store: StoreIndexEntity;

    @ManyToOne(() => ArchiveIndexEntity, async archive => archive.groups,
        { primary: true, onDelete: 'CASCADE' })
    @JoinColumn([
        { name: 'archive_key', referencedColumnName: 'key' },
        { name: 'game_version', referencedColumnName: 'gameVersion' }
    ])
    archive: ArchiveIndexEntity;

    @PrimaryColumn('integer', { name: 'game_version', nullable: false, unique: false })
    gameVersion: number;

    @PrimaryColumn('integer', { name: 'archive_key', unique: false, nullable: false })
    archiveKey: number;

    @OneToMany(() => FileIndexEntity, fileIndex => fileIndex.group,
        { cascade: true, lazy: true })
    files: Promise<FileIndexEntity[]> | FileIndexEntity[];

    @Column('boolean', { name: 'flat', nullable: false, default: false })
    flatFile: boolean = false;

    @Column('integer', { name: 'stripe_count', nullable: false, default: 1 })
    stripeCount: number = 1;

    @Column('text', { nullable: true, default: null })
    stripes: string | null = null;

}
