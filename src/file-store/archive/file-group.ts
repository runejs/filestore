import { JSZipObject } from 'jszip';
import { IndexedFile } from './indexed-file';
import { IndexManifest } from '../index-manifest';
import { ByteBuffer } from '@runejs/core/buffer';


export class FileGroup extends IndexedFile {

    public files: { [key: string]: JSZipObject };

    public constructor(indexManifest: IndexManifest,
                       archiveId: number,
                       files: { [key: string]: JSZipObject }) {
        super(indexManifest, archiveId);
        this.files = files;
    }

    public async pack(): Promise<ByteBuffer> {
        const fileKeys = Object.keys(this.files);
        const fileCount = fileKeys.length;
        const fileSizes: number[] = new Array(fileCount);
        const fileData: Buffer[] = new Array(fileCount);

        for(let i = 0; i < fileCount; i++) {
            const fileName = fileKeys[i];
            fileData[i] = await this.files[fileName].async('nodebuffer');
            fileSizes[i] = fileData[i]?.length ?? 0;
        }

        // Size of all individual files + 1 int (4 bytes) per file containing it's size + 1 byte at the end denoting number of chunks
        const groupSize = fileSizes.reduce((a, c) => a + c) + (fileCount * 4) + 1;

        const groupBuffer = new ByteBuffer(groupSize);

        // Write individual file contents
        for(const file of fileData) {
            groupBuffer.putBytes(file);
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

        return groupBuffer.flipWriter();
    }

    public async getFile(fileIdOrName: number | string, extract: boolean = true): Promise<IndexedFile> {
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
    }

    public get fileCount(): number {
        return Object.keys(this.files).length;
    }

}
