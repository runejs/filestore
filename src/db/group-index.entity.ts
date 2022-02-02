import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryColumn } from 'typeorm';
import { FileIndexEntity } from './file-index.entity';
import { ArchiveIndexEntity } from './archive-index.entity';
import { IndexEntity } from './index-entity';
import { StoreIndexEntity } from './store-index.entity';


@Entity('group_index')
@Index('group_identifier', [ 'key', 'gameVersion', 'archiveKey' ], { unique: true })
export class GroupIndexEntity extends IndexEntity {

    @ManyToOne(() => StoreIndexEntity, async store => store.groups,
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

    @PrimaryColumn('integer', { name: 'archive_key', unique: false, nullable: false })
    archiveKey: number;

    @OneToMany(() => FileIndexEntity, fileIndex => fileIndex.group, { eager: true })
    files: FileIndexEntity[];

    @Column('boolean', { nullable: false, name: 'flat', default: false })
    flatFile: boolean = false;

    @Column('integer', { nullable: false, name: 'stripe_count', default: 1 })
    stripeCount: number = 1;

    @Column('text', { nullable: true, default: null })
    stripes: string | null = null;

}
