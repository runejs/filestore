import { CreateDateColumn, Entity, OneToMany, PrimaryColumn, UpdateDateColumn } from 'typeorm';

import { ArchiveIndexEntity } from './archive-index.entity';
import { GroupIndexEntity } from './group-index.entity';
import { FileIndexEntity } from './file-index.entity';


@Entity('store_index')
export class StoreIndexEntity {

    @PrimaryColumn('integer', { name: 'game_version', nullable: false, unique: true })
    gameVersion: number;

    @OneToMany(() => ArchiveIndexEntity, archive => archive.store, { eager: true })
    archives: ArchiveIndexEntity[];

    @OneToMany(() => GroupIndexEntity, group => group.store, { lazy: true })
    groups: Promise<GroupIndexEntity[]>;

    @OneToMany(() => FileIndexEntity, file => file.store, { lazy: true })
    files: Promise<FileIndexEntity[]>;

    @CreateDateColumn()
    created: Date;

    @UpdateDateColumn()
    updated: Date;

}
