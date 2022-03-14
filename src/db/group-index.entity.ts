import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryColumn } from 'typeorm';
import { FileIndexEntity } from './file-index.entity';
import { ArchiveIndexEntity } from './archive-index.entity';
import { IndexEntity } from './index-entity';
import { StoreIndexEntity } from './store-index.entity';
import { FileState } from '../file-state';


@Entity('group_index')
@Index('group_identifier', [ 'key', 'gameBuild', 'archiveKey' ], { unique: true })
export class GroupIndexEntity extends IndexEntity {

    @PrimaryColumn('text', { name: 'game_build', nullable: false, unique: false })
    gameBuild: string;

    @PrimaryColumn('integer', { name: 'archive_key', unique: false, nullable: false })
    archiveKey: number;

    @Column('boolean', { name: 'flat', nullable: false, default: false })
    flatFile: boolean = false;

    @Column('integer', { name: 'stripe_count', nullable: false, default: 1 })
    stripeCount: number = 1;

    @Column('text', { nullable: true, default: null })
    stripes: string | null = null;

    @Column('integer', { name: 'name_hash', nullable: true, default: 0 })
    nameHash: number = 0;

    @Column('integer', { nullable: false, default: 0 })
    version: number = 0;

    @Column('text', { name: 'data_state', nullable: false })
    state: FileState;

    @ManyToOne(() => StoreIndexEntity, async store => store.groups,
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

    @OneToMany(() => FileIndexEntity, fileIndex => fileIndex.group,
        { cascade: true, lazy: true })
    files: Promise<FileIndexEntity[]> | FileIndexEntity[];

}
