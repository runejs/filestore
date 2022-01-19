import { Column, Entity, ManyToOne, OneToMany, PrimaryColumn, PrimaryGeneratedColumn } from 'typeorm';
import { GroupIndexEntity } from './group-index.entity';
import { IndexEntity } from './index-entity';


@Entity('archive_index')
export class ArchiveIndexEntity extends IndexEntity {

    @OneToMany(() => GroupIndexEntity, group => group.archive)
    groups: GroupIndexEntity[];

}
