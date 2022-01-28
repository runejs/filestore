import {
    CreateDateColumn,
    Entity,
    OneToMany,
    PrimaryColumn,
    UpdateDateColumn
} from 'typeorm';
import { GroupIndexEntity } from './group-index.entity';
import { ArchiveIndexEntity } from './archive-index.entity';
import { FileIndexEntity } from './file-index.entity';


@Entity('store_index')
export class StoreIndexEntity {

    @PrimaryColumn('integer', { name: 'game_version', nullable: false, unique: true })
    gameVersion: number;

    @OneToMany(() => ArchiveIndexEntity, async archive => archive.store)
    archives: ArchiveIndexEntity[];

    @OneToMany(() => GroupIndexEntity, async group => group.store, { lazy: true })
    groups: Promise<GroupIndexEntity[]>;

    @OneToMany(() => FileIndexEntity, async file => file.store, { lazy: true })
    files: Promise<FileIndexEntity[]>;

    @CreateDateColumn()
    created: Date;

    @UpdateDateColumn()
    updated: Date;

}
