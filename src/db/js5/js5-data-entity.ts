import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { Js5FileType } from '../../config';
import { Buffer } from 'buffer';


@Entity('js5_data')
@Index('data_identifier', [
    'fileType', 'gameBuild', 'key', 'archiveKey', 'groupKey', 'compressed'
], { unique: true })
export class Js5DataEntity {

    @PrimaryColumn('text', { name: 'file_type', nullable: false, unique: false })
    fileType: Js5FileType;

    @PrimaryColumn('text', { name: 'game_build', nullable: false, unique: false })
    gameBuild: string;

    @PrimaryColumn('integer', { nullable: false, unique: false })
    key: number;

    @PrimaryColumn('integer', { name: 'archive_key', nullable: false, unique: false, default: -1 })
    archiveKey: number = -1;

    @PrimaryColumn('integer', { name: 'group_key', nullable: false, unique: false, default: -1 })
    groupKey: number = -1;

    @PrimaryColumn('boolean', { nullable: false, default: false })
    compressed: boolean = false;

    @Column('blob', { name: 'buffer', nullable: true, default: null })
    buffer: Buffer = null;

    @CreateDateColumn()
    created?: Date;

    @UpdateDateColumn()
    updated?: Date;

}
