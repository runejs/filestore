import { Column, CreateDateColumn, PrimaryColumn, UpdateDateColumn } from 'typeorm';


export abstract class IndexEntity {

    @PrimaryColumn('integer', { nullable: false, unique: false })
    key: number;

    @PrimaryColumn('integer', { name: 'game_version', nullable: false, unique: false })
    gameVersion: number;

    @Column('text', { nullable: true })
    name: string | null = null;

    @Column('integer', { nullable: true, name: 'name_hash' })
    nameHash: number | null = null;

    @Column('integer', { nullable: false })
    version: number = 0;

    @Column('integer', { nullable: false })
    size: number = 0;

    @Column('integer', { nullable: true })
    crc32: number | null = null;

    @Column('text', { nullable: true })
    sha256: string | null = null;

    @CreateDateColumn()
    created: Date;

    @UpdateDateColumn()
    updated: Date;

}
