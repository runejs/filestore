import { ByteBuffer } from '@runejs/common/buffer';
import { existsSync, readFile } from 'graceful-fs';
import { join } from 'path';
import { Group } from './group';
import { Archive } from './archive';
import { FileIndex } from './archive-index';
import { IndexedFileEntry } from './indexed-file-entry';
import { logger } from '@runejs/common';
import { readFileSync } from 'fs';


export class File extends IndexedFileEntry<FileIndex> {

    public readonly group: Group;
    public readonly archive: Archive;

    public constructor(index: string | number, group: Group, indexData?: FileIndex) {
        super(index, group.store, indexData);
        this.group = group;
        this.archive = group.archive;
    }

    public readFlatFile(): boolean {
        const { extension, group } = this;
        const flatFilePath = group.path + extension;
        let fileFound = true;

        this._name = group.name;
        this._nameHash = group.nameHash;

        let fileData: ByteBuffer = new ByteBuffer([]);

        if(!existsSync(flatFilePath)) {
            fileFound = false;
        } else {
            fileData = this.readFileData(flatFilePath);
        }

        if(!fileData?.length) {
            // logger.warn(`${flatFilePath} was not found.`);
            fileFound = false;
        }

        group.setData(fileData, false);
        this.setData(fileData, false);

        this.stripeSizes = this.indexData.stripeSizes;
        this.crc32 = this.indexData.crc32 ?? 0;
        this.sha256 = this.indexData.sha256 ?? undefined;

        if(this.size !== this.indexData.size || this.sha256 !== this.generateSha256()) {
            this._modified = true;
        }

        this._loaded = true;

        return fileFound;
    }

    public readGroupedFile(): boolean {
        const { extension } = this;
        let fileFound = true;

        const filePath = this.path + extension;

        let fileData: ByteBuffer = new ByteBuffer([]);

        if(!existsSync(filePath)) {
            fileFound = false;
        } else {
            fileData = this.readFileData(filePath);
        }

        if(!fileData?.length) {
            // logger.warn(`${filePath} was not found.`);
            fileFound = false;
        }

        this.setData(fileData, false);

        this.stripeSizes = this.indexData.stripeSizes;
        this.crc32 = this.indexData.crc32 ?? 0;
        this.sha256 = this.indexData.sha256 ?? undefined;

        if(this.size !== this.indexData.size || this.sha256 !== this.generateSha256()) {
            this._modified = true;
        }

        this._loaded = true;

        return fileFound;
    }

    public readFileData(filePath: string): ByteBuffer {
        return new ByteBuffer(readFileSync(filePath) ?? []);
    }

    public generateIndexData(): FileIndex {
        const { nameOrIndex: name, nameHash, size, crc32, sha256, stripeSizes } = this;
        this._indexData = {
            name, nameHash, size, stripeSizes, crc32, sha256
        };

        return this._indexData;
    }

    public get path(): string {
        return join(this.group.path, this.indexData?.name ?? '');
    }

    public get outputPath(): string {
        return join(this.group.outputPath, this.indexData?.name ?? '');
    }

    public get extension(): string {
        return this.archive?.config?.fileExtension ?? '';
    }
}
