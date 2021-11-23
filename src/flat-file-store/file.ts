import { join } from 'path';
import { existsSync, readFileSync } from 'graceful-fs';
import { logger } from '@runejs/common';
import { ByteBuffer } from '@runejs/common/buffer';

import { Group } from './group';
import { Archive } from './archive';
import { FileIndex } from './archive-index';
import { IndexedFile } from './indexed-file';
import { FileError } from './file-error';


export class File extends IndexedFile<FileIndex> {

    public readonly group: Group;
    public readonly archive: Archive;

    public constructor(index: string | number, group: Group, indexData?: FileIndex) {
        super(index, group.store, indexData);
        this.group = group;
        this.archive = group.archive;
    }

    public readFileData(): ByteBuffer | null {
        const flatFile = this.group.indexData.files.size === 1;
        const filePath = (flatFile ? this.group.path : this.path) + this.extension;
        const shortPath = `${this.archive.name}/${this.group.name}${!flatFile ? `/${this.index}` : ``}`;

        if(!existsSync(filePath)) {
            logger.warn(`File not found: ${shortPath}`);
            this.recordError(FileError.NOT_FOUND);
            return null;
        }

        // Async `readFile` runs a lot slower than `readFileSync` here
        const data = readFileSync(filePath);

        if(!data) {
            this.recordError(FileError.INVALID);
        } else if(!data.length) {
            this.recordError(FileError.EMPTY);
        } else {
            const fileData = new ByteBuffer(data);

            if(flatFile) {
                this.group.setData(fileData, false);
                this._name = this.group.name;
                this._nameHash = this.group.nameHash;
            }

            this.setUncompressedData(fileData);
            this._loaded = true;

            return fileData;
        }

        logger.warn(`Error reading file data: ${shortPath}`);
        return null;
    }

    public override generateIndexData(): FileIndex {
        const { nameOrIndex: name, nameHash, size, crc32, sha256, stripeSizes } = this;
        this._indexData = {
            name, nameHash, size, stripeSizes, crc32, sha256
        };

        return this._indexData;
    }

    public setUncompressedData(fileData: ByteBuffer): void {
        this.setData(fileData, false);

        this.stripeSizes = this.indexData.stripeSizes;
        this.crc32 = this.indexData.crc32 ?? 0;
        this.sha256 = this.indexData.sha256 ?? undefined;

        if(this.size !== this.indexData.size || this.sha256 !== this.generateSha256()) {
            this._modified = true;
        }
    }

    public override get path(): string {
        return join(this.group.path, this.indexData?.name ?? '');
    }

    public override get outputPath(): string {
        return join(this.group.outputPath, this.indexData?.name ?? '');
    }

    public get extension(): string {
        return this.archive?.details?.fileExtension ?? '';
    }
}
