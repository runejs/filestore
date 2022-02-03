import { Entity, Index, JoinColumn, ManyToOne, OneToMany } from 'typeorm';

import { IndexEntity } from './index-entity';
import { StoreIndexEntity } from './store-index.entity';
import { GroupIndexEntity } from './group-index.entity';


@Entity('archive_index')
@Index('archive_identifier', [ 'key', 'gameVersion' ], { unique: true })
export class ArchiveIndexEntity extends IndexEntity {

    @ManyToOne(() => StoreIndexEntity, async store => store.archives,
        { lazy: true, primary: true, onDelete: 'CASCADE' })
    @JoinColumn({ name: 'game_version', referencedColumnName: 'gameVersion' })
    store: Promise<StoreIndexEntity>;

    @OneToMany(() => GroupIndexEntity, async group => group.archive)
    groups: GroupIndexEntity[];

}
