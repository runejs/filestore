import { Column, CreateDateColumn, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { FileState } from '../fs';


export abstract class IndexEntity {

    @PrimaryColumn('integer', { nullable: false, unique: false })
    key: number;

    @Column('text', { nullable: true, default: null })
    name: string | null = null;

    @Column('integer', { nullable: false, default: 0 })
    size: number = 0;

    @Column('integer', { nullable: true, default: null })
    crc32: number | null = null;

    @Column('text', { nullable: true, default: null })
    sha256: string | null = null;

    @Column('blob', { name: 'data', nullable: true, default: null })
    data: Buffer | null = null;

    @Column('text', { name: 'state', nullable: false })
    state: FileState;

    @CreateDateColumn()
    created: Date;

    @UpdateDateColumn()
    updated: Date;

}
