import { logger } from '@runejs/core';
import { existsSync, mkdirSync, writeFileSync } from 'fs';

import { ClientFileStore} from '../client-file-store';
import { ClientFile } from '../client-file';
import { getFileName } from '../file-naming';
import { Store } from './store';


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
            const binaryFiles: ClientFile[] = this.decodeBinaryFileStore();
            binaryFiles.forEach(file => this.writeToDisk(file));
        } else {
            // Write single file
            return new Promise((resolve, reject) => {
                try {
                    const fileName = getFileName(binaryFile.nameHash).replace(/ /g, '_');
                    if(!existsSync('./unpacked/binary')) {
                        mkdirSync('./unpacked/binary');
                    }
                    writeFileSync(`./unpacked/binary/${binaryFile.fileIndex}_${fileName}`, Buffer.from(binaryFile.content));
                    resolve();
                } catch(error) {
                    reject(error);
                }
            });
        }
    }

    /**
     * Fetches the specified binary file.
     * @param nameOrId The name or ID of the binary file.
     * @returns The binary FileData object, or null if the file is not found.
     */
    public getBinaryFile(nameOrId: string | number): ClientFile | null {
        if(!nameOrId) {
            return null;
        }

        const binaryIndex = this.fileStore.getArchive('binary');
        return binaryIndex.getFile(nameOrId) || null;
    }

    /**
     * Decodes all binary files within the binary store.
     * @returns The list of decoded files from the binary store.
     */
    public decodeBinaryFileStore(): ClientFile[] {
        const binaryIndex = this.fileStore.getArchive('binary');
        const binaryFileCount = binaryIndex.groups.size;
        const binaryFiles: ClientFile[] = new Array(binaryFileCount);

        for(let binaryFileId = 0; binaryFileId < binaryFileCount; binaryFileId++) {
            const fileData = binaryIndex.getFile(binaryFileId);
            if(!fileData) {
                binaryFiles[binaryFileId] = null;
                logger.warn(`No file found for binary file ID ${binaryFileId}.`);
                continue;
            }

            binaryFiles[binaryFileId] = fileData;
        }

        return binaryFiles;
    }

}
