import { FileGroupMetadata } from '../index-manifest';
import { ByteBuffer } from '@runejs/core/buffer';
import { IndexedFile } from './indexed-file';
import { IndexedArchive } from '../archive';
import * as path from 'path';
import * as fs from 'graceful-fs';
import { logger } from '@runejs/core';
import { FlatFile } from './flat-file';


export class FileGroup extends IndexedFile {

    public groups: Map<number, FlatFile> = new Map<number, FlatFile>();

    // private _fileData: Buffer[] = [];
    private fileNames: string[] = [];
    private fileEntry: FileGroupMetadata;
    private filesLoaded: boolean = false;

    public constructor(archive: IndexedArchive,
                       fileIndex: number,
                       fileEntry: FileGroupMetadata) {
        super(archive, fileIndex);
        this.fileEntry = fileEntry;
    }

    public async packFileData(): Promise<ByteBuffer | undefined> {
        if(!this.filesLoaded) {
            await this.loadFiles();
        }

        const fileData: Buffer[] = Array.from(this.groups.values())
            .map(file => file?.fileData?.toNodeBuffer() ?? null); // .filter(file => !!file);
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

        for(const fileName of this.fileEntry.fileNames) {
            if(!fileName) {
                continue;
            }

            const fileExtensionIndex = fileName.lastIndexOf('.');
            const childIndex = Number(fileName.substring(0, fileExtensionIndex));

            const filePath = path.join(this.archive.filePath, this.fileEntry.name, fileName);
            if(!fs.existsSync(filePath)) {
                this.groups.set(childIndex, null);
                logger.warn(`Grouped file ${filePath} not found.`);
            } else {
                try {
                    const fileData = fs.readFileSync(filePath);
                    if(fileData) {
                        this.groups.set(childIndex, new FlatFile(this.archive, childIndex, new ByteBuffer(fileData)));
                    } else {
                        this.groups.set(childIndex, null);
                        logger.warn(`Grouped file ${filePath} is empty.`);
                    }
                } catch(error) {
                    logger.error(error);
                }
                /*promises.push(new Promise(resolve =>
                    fs.readFile(filePath, {}, (err, data) => {
                        if(err) {
                            logger.error(err);
                        } else {
                            if(data) {
                                this.files.set(childIndex, new FlatFile(this.archive, childIndex, new ByteBuffer(data)));
                            } else {
                                this.files.set(childIndex, null);
                                logger.warn(`Grouped file ${filePath} is empty.`);
                            }
                        }
                        resolve();
                    })));*/
            }
        }

        this.filesLoaded = true;
    }

}
