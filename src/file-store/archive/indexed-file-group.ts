import JSZip, { JSZipObject } from 'jszip';
import { IndexedFile } from './indexed-file';
import { IndexManifest } from '../index-manifest';
import { ByteBuffer } from '@runejs/core/buffer';
import { compressVersionedFile } from '../../compression';
import { logger } from '@runejs/core';


export class IndexedFileGroup extends IndexedFile {

    private _folder: JSZip;
    private files: JSZipObject[] = [];
    private fileNames: string[] = [];

    public constructor(indexManifest: IndexManifest,
                       archiveId: number,
                       zippedFolder: JSZip) {
        super(indexManifest, archiveId);
        this._folder = zippedFolder;
        this.loadFileInfo();
    }

    public loadFileInfo(): void {
        let filePaths: string[] = [];
        let files: JSZipObject[] = [];
        this.folder.forEach((filePath, file) => {
            filePaths.push(filePath);
            files.push(file);
        });

        this.files = files;
        this.fileNames = filePaths;
    }

    public async packGroup(): Promise<ByteBuffer | null> {
        const filePromises: Promise<Buffer>[] = new Array(this.fileCount);

        for(let i = 0; i < this.fileCount; i++) {
            filePromises[i] = this.files[i].async('nodebuffer');
        }

        const fileData: Buffer[] = await Promise.all(filePromises);
        const fileSizes = fileData.map(data => data?.length ?? 0);

        // Size of all individual files + 1 int (4 bytes) per file containing it's size + 1 byte at the end
        // denoting number of chunks
        const groupSize = fileSizes.reduce((a, c) => a + c) + (this.fileCount * 4) + 1;

        const groupBuffer = new ByteBuffer(groupSize);

        // Write individual file contents
        for(let i = 0; i < this.fileCount; i++) {
            groupBuffer.putBytes(fileData[i]);
        }

        // Write individual file sizes
        let prevLen: number = 0;
        for(const fileSize of fileSizes) {
            // Stripe length
            groupBuffer.put(fileSize - prevLen, 'int');
            prevLen = fileSize;
        }

        // Write stripe count
        groupBuffer.put(1); // Stripe count should always be 1 because we're making a clean archive :)

        this.fileData = groupBuffer.flipWriter();

        return this.fileData;
    }

    public async compressGroup(): Promise<ByteBuffer | null> {
        try {
            const buffer = await this.packGroup();

            this._compressedFileData = compressVersionedFile({
                buffer,
                compression: this.fileCompression,
                version: this.fileVersion
            });

            return this._compressedFileData;
        } catch(error) {
            logger.error(`Error compressing file group ${this.fileId} in index ${this.indexManifest.indexId}:`);
            logger.error(error);
            return null;
        }
    }

    /*public async getFile(fileIdOrName: number | string, extract: boolean = true): Promise<IndexedFile> {
        // @TODO manifests for file groups to auto-index files
        const fileName = typeof fileIdOrName === 'string' ? fileIdOrName :
            `${fileIdOrName}${this.indexManifest.fileExtension}`;

        const fileKeys = Object.keys(this.indexManifest.files);

        let fileIndex: number;

        if(typeof fileIdOrName === 'number') {
            fileIndex = fileIdOrName;
        } else {
            const foundFiles = fileKeys.find(key => key === fileIdOrName);
            if(foundFiles?.length) {
                fileIndex = parseInt(foundFiles[0], 10);
            }
        }

        const fileData = extract ? new ByteBuffer(await this.files[fileName].async('nodebuffer')) : null;
        return new IndexedFile(this.indexManifest, fileIndex, fileData);
    }*/

    public get fileCount(): number {
         return this.files.length;
    }

    public get folder(): JSZip {
        return this._folder;
    }

}
