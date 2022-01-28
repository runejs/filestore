import { Column, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryColumn } from 'typeorm';
import { FileIndexEntity } from './file-index.entity';
import { ArchiveIndexEntity } from './archive-index.entity';
import { IndexEntity } from './index-entity';
import { StoreIndexEntity } from './store-index.entity';


@Entity('group_index')
export class GroupIndexEntity extends IndexEntity {

    @ManyToOne(() => StoreIndexEntity, async store => store.groups, { lazy: true, primary: true })
    @JoinColumn({ name: 'game_version' })
    store: Promise<StoreIndexEntity>;

    @ManyToOne(() => ArchiveIndexEntity, archive => archive.groups, { lazy: true, primary: true })
    @JoinColumn({ name: 'archive_key' })
    @JoinColumn({ name: 'game_version' })
    archive: Promise<ArchiveIndexEntity>;

    @OneToMany(() => FileIndexEntity, async fileIndex => fileIndex.group)
    files: FileIndexEntity[];

    @PrimaryColumn('integer', { nullable: false, name: 'archive_key' })
    archiveKey: number;

    @Column('integer', { nullable: false, name: 'stripe_count' })
    stripeCount: number = 1;

}
