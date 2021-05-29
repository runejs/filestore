import { JSZipObject } from 'jszip';
import { IndexedFile } from './indexed-file';
import { getCompressionKey, IndexManifest } from '../index-manifest';
import { ByteBuffer } from '@runejs/core/buffer';
import { compress } from '../../compression';


export class FileGroup extends IndexedFile {

    public files: { [key: string]: JSZipObject };

    public constructor(indexManifest: IndexManifest,
                       archiveId: number,
                       files: { [key: string]: JSZipObject }) {
        super(indexManifest, archiveId);
        this.files = files;
    }

    public async compress(): Promise<ByteBuffer> {
        const fileKeys = Object.keys(this.files);
        const fileCount = fileKeys.length;
        console.log(`\n\nFile Count = ${fileCount}`);
        const fileSizes: number[] = new Array(fileCount);
        const fileData: Buffer[] = new Array(fileCount);

        for(let i = 0; i < fileCount; i++) {
            const fileName = fileKeys[i];
            fileData[i] = await this.files[fileName].async('nodebuffer');
            fileSizes[i] = fileData[i]?.length ?? 0;
        }

        console.log(`\nFile Sizes`);
        console.log(fileSizes);

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
            groupBuffer.put(fileSize - prevLen, 'int');
            prevLen = fileSize;
        }

        // Write stripe count
        groupBuffer.put(1); // Stripe count should always be 1 because we're making a clean archive :)

        console.log(`WRITER = ${groupBuffer.writerIndex}`);

        const group = groupBuffer.flipWriter();
        const compression = getCompressionKey(this.indexManifest.fileCompression);

        console.log(`\nGroup`);
        console.log(`LENGTH = ${group.length}`);
        console.log(`COMPRESSION = ${compression}`);
        console.log(group);

        return compress({
            buffer: group,
            compression: getCompressionKey(this.indexManifest.fileCompression),
            version: this.indexManifest.files[this.fileId].version || -1
        });
    }

    public async getFile(fileId: number): Promise<IndexedFile> {
        // @TODO manifests for file groups to auto-index files
        const fileName = `${fileId}${this.indexManifest.fileExtension}`;
        const fileData = await this.files[fileName].async('nodebuffer');
        return new IndexedFile(this.indexManifest, fileId, new ByteBuffer(fileData));
    }

}
