import { Column, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryColumn, PrimaryGeneratedColumn } from 'typeorm';
import { FileIndexEntity } from './file-index.entity';
import { ArchiveIndexEntity } from './archive-index.entity';
import { IndexEntity } from './index-entity';


@Entity('group_index')
export class GroupIndexEntity extends IndexEntity {

    @OneToMany(() => FileIndexEntity, fileIndex => fileIndex.group)
    files: FileIndexEntity[];

    @ManyToOne(() => ArchiveIndexEntity, archive => archive.groups)
    @JoinColumn({ name: 'archive_key' })
    archive: ArchiveIndexEntity;

    @Column('integer', { nullable: false, name: 'archive_key' })
    archiveKey: number;

    @Column('integer', { nullable: false })
    stripeCount: number = 1;

}
