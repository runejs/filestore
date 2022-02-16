import { Column, CreateDateColumn, PrimaryColumn, UpdateDateColumn } from 'typeorm';


export abstract class IndexEntity {

    @PrimaryColumn('integer', { nullable: false, unique: false })
    key: number;

    @Column('text', { nullable: true, default: null })
    name: string | null = null;

    @Column('integer', { name: 'name_hash', nullable: true, default: 0 })
    nameHash: number = 0;

    @Column('integer', { nullable: false, default: 0 })
    version: number = 0;

    @Column('integer', { nullable: false, default: 0 })
    size: number = 0;

    @Column('integer', { nullable: true, default: null })
    crc32: number | null = null;

    @Column('text', { nullable: true, default: null })
    sha256: string | null = null;

    @Column('blob', { name: 'data', nullable: true, default: null })
    data: Buffer | null = null;

    @CreateDateColumn()
    created: Date;

    @UpdateDateColumn()
    updated: Date;

}
