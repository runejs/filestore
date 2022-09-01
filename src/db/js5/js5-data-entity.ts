import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { Js5FileType } from '../../config';
import { Buffer } from 'buffer';


@Entity('js5_compressed_data')
@Index('compressed_data_identifier', [
    'fileType', 'gameBuild', 'key', 'archiveKey', 'groupKey'
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

    @Column('blob', { name: 'buffer', nullable: true, default: null })
    buffer: Buffer = null;

    @Column('boolean', { nullable: true, default: false })
    compressed: boolean = false;

    @CreateDateColumn()
    created?: Date;

    @UpdateDateColumn()
    updated?: Date;

}
