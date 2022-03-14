import { join } from 'path';
import { existsSync, readFileSync } from 'graceful-fs';
import { ByteBuffer, logger } from '@runejs/common';

import { FileIndexEntity } from './db';
import { FileBreadcrumb, IndexedFile } from './indexed-file';
import { FileState } from './file-state';
import { isSet } from './util';


export class FlatFile extends IndexedFile<FileIndexEntity> {

    public stripes: number[] = [];
    public stripeCount: number = 1;

    public constructor(index: FileIndexEntity, breadcrumb?: Partial<FileBreadcrumb>) {
        super(index, breadcrumb);

        if(isSet(index.stripes)) {
            this.stripes = index.stripes.split(',').map(n => Number(n));
        }
        if(isSet(index.stripeCount)) {
            this.stripeCount = index.stripeCount;
        }
        if(isSet(index.version)) {
            this.version = index.version;
        }
        if(isSet(index.nameHash)) {
            this.nameHash = index.nameHash;
        }
    }

    public override read(compress: boolean = false): ByteBuffer | null | Promise<ByteBuffer | null> {
        if(!this.group) {
            throw new Error(`Flat file ${this.key} could not be read as it does not belong to any known groups.`);
        }

        const filePath = this.path;

        if(!existsSync(filePath)) {
            logger.error(`File not found: ${filePath}`);
            this.setState(FileState.missing);
            return null;
        }

        let data: Buffer | null = null;

        try {
            data = readFileSync(filePath);
        } catch(error) {
            logger.error(`Error reading file ${this.name || this.key } at ${filePath}:`, error);
            data = null;
        }

        if(!data) {
            this.setState(FileState.corrupt);
        } else if(!data.length) {
            this.setState(FileState.empty);
        } else {
            const fileData = new ByteBuffer(data);

            if(!this.name) {
                this.name = this.group.name || this.key;
            }

            if(!this.nameHash) {
                this.nameHash = this.group.nameHash || undefined;
            }

            if(!this.stripes) {
                const stripeStr = this.index.stripes;
                if(stripeStr?.length) {
                    this.stripes = stripeStr.split(',')?.map(s => Number(s)) ?? undefined;
                }
            }

            if(!this.crc32) {
                this.crc32 = this.index.crc32 ?? 0;
            }

            if(!this.sha256) {
                this.sha256 = this.index.sha256 ?? undefined;
            }

            this.setData(fileData, FileState.raw);

            if(this.size !== this.index.size || this.sha256 !== this.generateSha256()) {
                this._modified = true;
            }

            return fileData;
        }

        logger.error(`Error reading file data: ${filePath}`);
        return null;
    }

    public override get path(): string {
        const groupPath = this.group?.path || null;
        if(!groupPath) {
            throw new Error(`Error generating file path; File ${this.key} has not been added to a group.`);
        }

        if(this.group.fileCount === 1 || this.archive?.config?.flatten) {
            return groupPath + this.type;
        } else {
            return join(groupPath, String(this.name || this.key)) + this.type;
        }
    }

    public override get outputPath(): string {
        const groupOutputPath = this.group?.outputPath || null;
        if(!groupOutputPath) {
            throw new Error(`Error generating file output path; File ${this.key} has not been added to a group.`);
        }

        if(this.group.fileCount === 1 || this.archive?.config?.flatten) {
            return groupOutputPath + this.type;
        } else {
            return join(groupOutputPath, String(this.name || this.key) + this.type);
        }
    }

}
