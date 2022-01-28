import { Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { GroupIndexEntity } from './group-index.entity';
import { IndexEntity } from './index-entity';
import { StoreIndexEntity } from './store-index.entity';


@Entity('archive_index')
export class ArchiveIndexEntity extends IndexEntity {

    @ManyToOne(() => StoreIndexEntity, store => store.archives, { lazy: true, primary: true })
    @JoinColumn({ name: 'game_version' })
    store: Promise<StoreIndexEntity>;

    @OneToMany(() => GroupIndexEntity, async group => group.archive)
    groups: GroupIndexEntity[];

}
