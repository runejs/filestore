import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryColumn } from 'typeorm';

import { IndexEntity } from './index-entity';
import { StoreIndexEntity } from './store-index.entity';
import { GroupIndexEntity } from './group-index.entity';
import { FileState } from '../file-state';


@Entity('archive_index')
@Index('archive_identifier', [ 'key', 'gameBuild' ], { unique: true })
export class ArchiveIndexEntity extends IndexEntity {

    @PrimaryColumn('text', { name: 'game_build', nullable: false, unique: false })
    gameBuild: string;

    @Column('integer', { name: 'group_count', nullable: false, default: 0 })
    groupCount: number = 0;

    @Column('integer', { name: 'format', nullable: false, default: 5 })
    format: number = 5;

    @Column('text', { name: 'data_state', nullable: false })
    state: FileState;

    @ManyToOne(() => StoreIndexEntity, async store => store.archives,
        { primary: true, onDelete: 'CASCADE' })
    @JoinColumn({ name: 'game_build', referencedColumnName: 'gameBuild' })
    store: StoreIndexEntity;

    @OneToMany(() => GroupIndexEntity, group => group.archive,
        { cascade: true, lazy: true })
    groups: Promise<GroupIndexEntity[]> | GroupIndexEntity[];

}
