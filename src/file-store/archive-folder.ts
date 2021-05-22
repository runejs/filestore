import { JSZipObject } from 'jszip';
import { ArchiveFile } from './archive-file';
import { IndexManifest } from './index-manifest';
import { ByteBuffer } from '@runejs/core/buffer';


export class ArchiveFolder extends ArchiveFile {

    public files: { [key: string]: JSZipObject };

    public constructor(indexManifest: IndexManifest,
                       archiveId: number,
                       files: { [key: string]: JSZipObject }) {
        super(indexManifest, archiveId);
        this.files = files;
    }

    public async packFolder(): Promise<ByteBuffer> {
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
        const archiveSize = fileSizes.reduce((a, c) => a + c) + (fileCount * 4) + 1;

        const archive = new ByteBuffer(archiveSize);

        // Write individual file contents
        for(const file of fileData) {
            archive.putBytes(file);
        }

        // Write individual file sizes
        for(const fileSize of fileSizes) {
            archive.put(fileSize, 'int');
        }

        // Write chunk count
        archive.put(1); // Chunk count should always be 1 because we're making a clean archive :)

        // @TODO recompress archive file and we're done!

        return archive;
    }

    public async getFile(fileId: number): Promise<ArchiveFile> {
        const fileName = `${fileId}${this.indexManifest.fileExtension}`; // @TODO folder manifests for these sub-archive file indexes
        const fileData = await this.files[fileName].async('nodebuffer');
        return new ArchiveFile(this.indexManifest, fileId, new ByteBuffer(fileData));
    }

}
