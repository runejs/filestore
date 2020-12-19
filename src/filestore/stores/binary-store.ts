import { Filestore, getFileName } from '../filestore';
import { logger } from '@runejs/core';
import { Archive } from '../archive';
import { hash } from '../util/name-hash';
import { existsSync, mkdirSync, writeFileSync } from 'fs';


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
    public async writeToDisk(binaryFile?: Archive): Promise<void> {
        if(!binaryFile) {
            // Write all files
            const binaryFiles: Archive[] = this.decodeBinaryStore();
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
     * @returns The binary archive file, or null if the file is not found.
     */
    public getBinary(nameOrId: string | number): Archive | null {
        if(!nameOrId) {
            return null;
        }

        const binaryIndex = this.fileStore.getIndex('binary');

        if(typeof nameOrId === 'string') {
            const packCount = binaryIndex.archives.size;
            const nameHash = hash(nameOrId);
            for(let binaryId = 0; binaryId < packCount; binaryId++) {
                try {
                    const archive = binaryIndex.getArchive(binaryId, false);
                    if(!archive) {
                        continue;
                    }

                    if(nameHash === archive.nameHash) {
                        return archive;
                    }
                } catch(e) {}
            }
        } else {
            const archive = binaryIndex.getArchive(nameOrId, false);
            if(archive) {
                return archive;
            }
        }

        return null;
    }

    /**
     * Decodes all binary files within the binary store.
     * @returns The list of decoded files from the binary store.
     */
    public decodeBinaryStore(): Archive[] {
        const binaryIndex = this.fileStore.getIndex('binary');
        const binaryFileCount = binaryIndex.archives.size;
        const binaryFiles: Archive[] = new Array(binaryFileCount);

        for(let binaryFileId = 0; binaryFileId < binaryFileCount; binaryFileId++) {
            const archive = binaryIndex.getArchive(binaryFileId, false);
            if(!archive) {
                binaryFiles[binaryFileId] = null;
                logger.warn(`No archive found for binary file ID ${binaryFileId}.`);
                continue;
            }

            binaryFiles[binaryFileId] = archive;
        }

        return binaryFiles;
    }

}
