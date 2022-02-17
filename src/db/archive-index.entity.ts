import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryColumn } from 'typeorm';

import { IndexEntity } from './index-entity';
import { StoreIndexEntity } from './store-index.entity';
import { GroupIndexEntity } from './group-index.entity';


@Entity('archive_index')
@Index('archive_identifier', [ 'key', 'gameVersion' ], { unique: true })
export class ArchiveIndexEntity extends IndexEntity {

    @ManyToOne(() => StoreIndexEntity, store => store.archives,
        { primary: true, onDelete: 'CASCADE' })
    @JoinColumn({ name: 'game_version', referencedColumnName: 'gameVersion' })
    store: StoreIndexEntity;

    @OneToMany(() => GroupIndexEntity, group => group.archive, { cascade: true })
    groups: GroupIndexEntity[];

    @PrimaryColumn('integer', { name: 'game_version', nullable: false, unique: false })
    gameVersion: number;

    @Column('integer', { name: 'group_count', nullable: false, default: 0 })
    groupCount: number = 0;

    @Column('integer', { name: 'format', nullable: false, default: 5 })
    format: number = 5;

}
