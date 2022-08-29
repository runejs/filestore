import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { CompressionMethod } from '@runejs/common/compress';
import { FileError, JagFileType } from '../../config';
import { Buffer } from 'buffer';


@Entity('jag_index')
@Index('index_identifier', [
    'fileType', 'gameBuild', 'key', 'cacheKey', 'archiveKey'
], { unique: true })
export class JagIndexEntity {

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

    @Column('text', { nullable: true, default: null })
    name: string = null;

    @Column('integer', { name: 'name_hash', nullable: true, default: -1 })
    nameHash: number = -1;

    @Column('integer', { nullable: false, default: -1 })
    version: number = -1;

    @Column('integer', { name: 'child_count', nullable: false, default: 0 })
    childCount: number = 0;

    @Column('integer', { nullable: false, default: -1 })
    checksum: number = -1;

    @Column('text', { name: 'sha_digest', nullable: true, default: null })
    shaDigest: string = null;

    @Column('integer', { name: 'file_size', nullable: false, default: 0 })
    fileSize: number = 0;

    @Column('blob', { name: 'data', nullable: true, default: null })
    data: Buffer = null;

    @Column('text', { name: 'compression_method', nullable: true, default: 'none' })
    compressionMethod: CompressionMethod = 'none';

    @Column('integer', { name: 'compressed_checksum', nullable: false, default: -1 })
    compressedChecksum: number = -1;

    @Column('text', { name: 'compressed_sha_digest', nullable: true, default: null })
    compressedShaDigest: string = null;

    @Column('integer', { name: 'compressed_file_size', nullable: false, default: 0 })
    compressedFileSize: number = 0;

    @Column('blob', { name: 'compressed_data', nullable: true, default: null })
    compressedData: Buffer = null;

    @Column('text', { name: 'file_error', nullable: true, default: null })
    fileError: FileError = null;

    @CreateDateColumn()
    created?: Date;

    @UpdateDateColumn()
    updated?: Date;

}