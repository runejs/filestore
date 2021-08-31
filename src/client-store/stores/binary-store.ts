import { logger } from '@runejs/core';
import { existsSync, mkdirSync, writeFileSync } from 'fs';

import { ClientFileStore} from '../client-file-store';
import { ClientFile } from '../client-file';
import { getFileName } from '../file-naming';
import { Store } from './store';
import { ClientArchive } from '../client-archive';
import { IndexedArchive } from '../../file-store';


/**
 * Controls misc binary file storage.
 */
export class BinaryStore extends Store {

    public constructor(fileStore: ClientFileStore) {
        super(fileStore, 'binary');
    }

    /**
     * Writes the specified file or all binary files to the disk.
     * @param binaryFile [optional] The file to write to disk. Writes all stored binary files to disk if not provided.
     */
    public async writeToDisk(binaryFile?: ClientFile): Promise<void> {
        if(!binaryFile) {
            // Write all files
            Array.from(this.decodeBinaryFileStore()).forEach(([ , file ]) => this.writeToDisk(file));
        } else {
            // Write single file
            return new Promise((resolve, reject) => {
                try {
                    const fileName = getFileName(binaryFile.nameHash).replace(/ /g, '_');
                    if(!existsSync('./unpacked/binary')) {
                        mkdirSync('./unpacked/binary');
                    }
                    writeFileSync(`./unpacked/binary/${binaryFile.fileIndex}_${fileName}`, Buffer.from(binaryFile.fileData));
                    resolve();
                } catch(error) {
                    reject(error);
                }
            });
        }
    }

    /**
     * Decodes all binary files within the binary store.
     * @returns The list of decoded files from the binary store.
     */
    public decodeBinaryFileStore(): Map<number, ClientFile> {
        const binaryFiles: Map<number, ClientFile> = new Map<number, ClientFile>();
        const archive = this.archive as ClientArchive;

        for(const [ binaryFileId, binaryFile ] of archive.groups) {
            if(!binaryFile?.fileData) {
                logger.warn(`No file found for binary file ID ${binaryFileId}.`);
                continue;
            }

            binaryFiles.set(binaryFileId, binaryFile);
        }

        return binaryFiles;
    }

    public get archive(): ClientArchive | IndexedArchive {
        if(this.flatFileStore) {
            return this.indexedArchive;
        } else {
            return this.clientArchive;
        }
    }

}
