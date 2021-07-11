import JSZip, { JSZipObject } from 'jszip';
import { IndexManifest } from '../index-manifest';
import { ByteBuffer } from '@runejs/core/buffer';
import { IndexedFile } from './indexed-file';


export class FileGroup extends IndexedFile {

    private _folder: JSZip;
    private _files: JSZipObject[] = [];
    private fileNames: string[] = [];

    public constructor(indexManifest: IndexManifest,
                       archiveId: number,
                       zippedFolder: JSZip) {
        super(indexManifest, archiveId);
        this._folder = zippedFolder;
        this.loadFileInfo();
    }

    public async packFileData(): Promise<ByteBuffer | undefined> {
        const filePromises: Promise<Buffer>[] = new Array(this.fileCount);

        this._files.forEach((file, i) => filePromises[i] = file.async('nodebuffer'));
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
