import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { JagFileType } from '../../config';
import { Buffer } from 'buffer';


@Entity('jag_data')
@Index('data_identifier', [
    'fileType', 'gameBuild', 'key', 'cacheKey', 'archiveKey', 'compressed'
], { unique: true })
export class JagDataEntity {

    @PrimaryColumn('text', { name: 'file_type', nullable: false, unique: false })
    fileType: JagFileType;

    @PrimaryColumn('text', { name: 'game_build', nullable: false, unique: false })
    gameBuild: string;

    @PrimaryColumn('integer', { nullable: false, unique: false })
    key: number;

    @PrimaryColumn('integer', { name: 'cache_key', nullable: false, unique: false })
    cacheKey: number;

    @PrimaryColumn('integer', { name: 'archive_key', nullable: false, unique: false, default: -1 })
    archiveKey: number = -1;

    @PrimaryColumn('boolean', { nullable: false, default: false })
    compressed: boolean = false;

    @Column('blob', { name: 'buffer', nullable: true, default: null })
    buffer: Buffer = null;

    @CreateDateColumn()
    created?: Date;

    @UpdateDateColumn()
    updated?: Date;

}
