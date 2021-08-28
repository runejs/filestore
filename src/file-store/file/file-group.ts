import JSZip, { JSZipObject } from 'jszip';
import { FileMetadata } from '../index-manifest';
import { ByteBuffer } from '@runejs/core/buffer';
import { IndexedFile } from './indexed-file';
import { IndexedArchive } from '../archive';
import * as path from 'path';
import * as fs from 'fs';
import { logger } from '@runejs/core';


export class FileGroup extends IndexedFile {

    private _folder: JSZip;
    private _files: JSZipObject[] = [];
    private _fileData: Buffer[] = [];
    private fileNames: string[] = [];
    private fileEntry: FileMetadata;
    private filesLoaded: boolean = false;

    public constructor(archive: IndexedArchive,
                       fileIndex: number,
                       fileEntry: FileMetadata,
                       zippedFolder?: JSZip) {
        super(archive, fileIndex);
        this.fileEntry = fileEntry;
        this._folder = zippedFolder;
        this.fileName = this.indexManifest?.files[this.fileIndex]?.name
            ?.replace(this.archive.config.fileExtension, '') ?? undefined;
    }

    public async packFileData(): Promise<ByteBuffer | undefined> {
        if(!this.filesLoaded) {
            await this.loadFiles();
        }

        // const filePromises: Promise<Buffer>[] = new Array(this.fileCount);

        // this._files.forEach((file, i) => filePromises[i] = file.async('nodebuffer'));
        const fileData: Buffer[] = this._fileData; // await Promise.all(filePromises);
        const fileSizes = fileData.map(data => data?.length ?? 0);
        const fileCount = fileData.length;

        // Size of all individual files + 1 int (4 bytes) per file containing it's size + 1 byte at the end
        // denoting number of chunks
        const groupSize = fileSizes.reduce((a, c) => a + c) + (fileCount * 4) + 1;

        const groupBuffer = new ByteBuffer(groupSize);

        // Write individual file contents
        for(let i = 0; i < fileCount; i++) {
            if(fileData[i]) {
                groupBuffer.putBytes(fileData[i]);
            }
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

    public async loadFiles(): Promise<void> {
        this.filesLoaded = false;
        const childCount = this.fileEntry.children.length;
        const promises: Promise<void>[] = new Array(childCount);
        this._fileData = new Array(childCount);
        for(let i = 0; i < childCount; i++) {
            const fileName = this.fileEntry.children[i];
            if(!fileName) {
                continue;
            }

            const filePath = path.join(this.archive.filePath, this.fileEntry.name, fileName);
            if(!fs.existsSync(filePath)) {
                logger.warn(`Grouped file ${filePath} not found.`);
                continue;
            }

            promises[i] = new Promise(resolve => fs.readFile(filePath, {},
                (err, data) => {
                    this._fileData[i] = !data ? null : data;
                    resolve();
                }));
        }

        await Promise.all(promises);
        this.filesLoaded = true;
    }

    public loadFileInfo(): void {
        let filePaths: string[] = [];
        let files: JSZipObject[] = [];
        this.folder.forEach((filePath, file) => {
            filePaths.push(filePath);
            files.push(file);
        });

        this._files = files;
        this.fileNames = filePaths;
    }

    public get files(): JSZip.JSZipObject[] {
        return this._files;
    }

    public get fileCount(): number {
         return this._files.length;
    }

    public get folder(): JSZip {
        return this._folder;
    }

}
