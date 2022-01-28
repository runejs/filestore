import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { GroupIndexEntity } from './group-index.entity';
import { IndexEntity } from './index-entity';
import { ArchiveIndexEntity } from './archive-index.entity';
import { StoreIndexEntity } from './store-index.entity';


@Entity('file_index')
export class FileIndexEntity extends IndexEntity {

    @ManyToOne(() => StoreIndexEntity, async store => store.files, { lazy: true, primary: true })
    @JoinColumn({ name: 'game_version' })
    store: Promise<StoreIndexEntity>;

    @ManyToOne(() => ArchiveIndexEntity, archive => archive.groups, { lazy: true, primary: true })
    @JoinColumn({ name: 'archive_key' })
    @JoinColumn({ name: 'game_version' })
    archive: Promise<ArchiveIndexEntity>;

    @ManyToOne(() => GroupIndexEntity, group => group.files, { lazy: true, primary: true })
    @JoinColumn({ name: 'archive_key' })
    @JoinColumn({ name: 'group_key' })
    @JoinColumn({ name: 'game_version' })
    group: Promise<GroupIndexEntity>;

    @PrimaryColumn('integer', { nullable: false, name: 'archive_key' })
    archiveKey: number;

    @PrimaryColumn('integer', { nullable: false, name: 'group_key' })
    groupKey: number;

    @Column('text', { nullable: true })
    stripes: string | null = null;

}
