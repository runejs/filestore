import { Column, CreateDateColumn, Entity, OneToMany, PrimaryColumn, UpdateDateColumn } from 'typeorm';

import { ArchiveIndexEntity } from './archive-index.entity';
import { GroupIndexEntity } from './group-index.entity';
import { FileIndexEntity } from './file-index.entity';


@Entity('store_index')
export class StoreIndexEntity {

    @PrimaryColumn('text', { name: 'game_build', nullable: false, unique: true })
    gameBuild: string;

    @OneToMany(() => ArchiveIndexEntity, archive => archive.store, { lazy: true })
    archives: Promise<ArchiveIndexEntity[]> | ArchiveIndexEntity[];

    @OneToMany(() => GroupIndexEntity, group => group.store, { lazy: true })
    groups: Promise<GroupIndexEntity[]> | GroupIndexEntity[];

    @OneToMany(() => FileIndexEntity, file => file.store, { lazy: true })
    files: Promise<FileIndexEntity[]> | FileIndexEntity[];

    @Column('blob', { name: 'data', nullable: true, default: null })
    data: Buffer | null = null;

    @CreateDateColumn()
    created: Date;

    @UpdateDateColumn()
    updated: Date;

}
