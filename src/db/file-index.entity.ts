import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn, PrimaryGeneratedColumn } from 'typeorm';
import { GroupIndexEntity } from './group-index.entity';
import { IndexEntity } from './index-entity';


@Entity('file_index')
export class FileIndexEntity extends IndexEntity {

    @ManyToOne(() => GroupIndexEntity, group => group.files)
    @JoinColumn({ name: 'group_key' })
    group: GroupIndexEntity;

    @Column('integer', { nullable: false, name: 'group_key' })
    groupKey: number;

    @Column('text', { nullable: true })
    stripes: string | null = null;

}
