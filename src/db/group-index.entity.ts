import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryColumn } from 'typeorm';
import { FileIndexEntity } from './file-index.entity';
import { ArchiveIndexEntity } from './archive-index.entity';
import { IndexEntity } from './index-entity';
import { StoreIndexEntity } from './store-index.entity';


@Entity('group_index')
@Index('group_identifier', [ 'key', 'gameVersion', 'archiveKey' ], { unique: true })
export class GroupIndexEntity extends IndexEntity {

    @ManyToOne(() => StoreIndexEntity, async store => store.groups, { lazy: true, primary: true })
    @JoinColumn({ name: 'game_version', referencedColumnName: 'gameVersion' })
    store: Promise<StoreIndexEntity>;

    @ManyToOne(() => ArchiveIndexEntity, archive => archive.groups, { lazy: true, primary: true })
    @JoinColumn([
        { name: 'archive_key', referencedColumnName: 'key' },
        { name: 'game_version', referencedColumnName: 'gameVersion' }
    ])
    archive: Promise<ArchiveIndexEntity>;

    @PrimaryColumn('integer', { name: 'archive_key', unique: false, nullable: false })
    archiveKey: number;

    @OneToMany(() => FileIndexEntity, async fileIndex => fileIndex.group)
    files: FileIndexEntity[];

    @Column('integer', { nullable: false, name: 'stripe_count' })
    stripeCount: number = 1;

}
