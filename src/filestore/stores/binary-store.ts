import { Filestore, getFileName } from '../filestore';
import { logger } from '@runejs/core';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { FileData } from '../file-data';


/**
 * Controls misc binary file storage.
 */
export class BinaryStore {

    private readonly fileStore: Filestore;

    public constructor(fileStore: Filestore) {
        this.fileStore = fileStore;
    }

    /**
     * Writes the specified file or all binary files to the disk.
     * @param binaryFile [optional] The file to write to disk. Writes all stored binary files to disk if not provided.
     */
    public async writeToDisk(binaryFile?: FileData): Promise<void> {
        if(!binaryFile) {
            // Write all files
            const binaryFiles: FileData[] = this.decodeBinaryStore();
            binaryFiles.forEach(file => this.writeToDisk(file));
        } else {
            // Write single file
            return new Promise((resolve, reject) => {
                try {
                    const fileName = getFileName(binaryFile.nameHash).replace(/ /g, '_');
                    if(!existsSync('./unpacked/binary')) {
                        mkdirSync('./unpacked/binary');
                    }
                    writeFileSync(`./unpacked/binary/${binaryFile.fileId}_${fileName}`, Buffer.from(binaryFile.content));
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
    public getBinary(nameOrId: string | number): FileData | null {
        if(!nameOrId) {
            return null;
        }

        const binaryIndex = this.fileStore.getIndex('binary');
        return binaryIndex.getFile(nameOrId) || null;
    }

    /**
     * Decodes all binary files within the binary store.
     * @returns The list of decoded files from the binary store.
     */
    public decodeBinaryStore(): FileData[] {
        const binaryIndex = this.fileStore.getIndex('binary');
        const binaryFileCount = binaryIndex.files.size;
        const binaryFiles: FileData[] = new Array(binaryFileCount);

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
