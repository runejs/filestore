import { Filestore } from '../filestore';
import { ByteBuffer, logger } from '@runejs/core';
import { existsSync, mkdirSync, writeFileSync } from 'fs';


/**
 * A single OGG file object.
 */
export class OggFile {

    public fileId: number;
    public nameHash: number;
    public content: ByteBuffer;

    public constructor(fileId: number, nameHash: number, content: ByteBuffer) {
        this.fileId = fileId;
        this.nameHash = nameHash;
        this.content = content;
    }

    /**
     * Writes this unpacked OGG file to the disk under `./unpacked/ogg/{oggId}.ogg`
     */
    public async writeToDisk(): Promise<void> {
        return new Promise((resolve, reject) => {
            try {
                if(!existsSync('./unpacked/ogg')) {
                    mkdirSync('./unpacked/ogg');
                }
                writeFileSync(`./unpacked/ogg/${this.fileId}.ogg`, Buffer.from(this.content));
                resolve();
            } catch(error) {
                reject(error);
            }
        });
    }

}


/**
 * Controls OGG file storage.
 */
export class OggStore {

    private readonly fileStore: Filestore;

    public constructor(fileStore: Filestore) {
        this.fileStore = fileStore;
    }

    /**
     * Decodes the specified OGG file.
     * @param id The ID of the OGG file.
     * @returns The decoded OggFile object, or null if the file is not found.
     */
    public getOgg(id: number): OggFile | null {
        if(id === undefined || id === null) {
            return null;
        }

        const oggArchiveIndex = this.fileStore.getIndex('ogg');
        const fileData = oggArchiveIndex.getFile(id);
        return fileData ? new OggFile(id, fileData.nameHash, fileData.content) : null;
    }

    /**
     * Decodes all OGG files within the filestore.
     * @returns The list of decoded OggFile objects from the OGG store.
     */
    public decodeOggStore(): OggFile[] {
        const oggArchiveIndex = this.fileStore.getIndex('ogg');
        const fileCount = oggArchiveIndex.files.size;
        const oggFiles: OggFile[] = new Array(fileCount);

        for(let oggId = 0; oggId < fileCount; oggId++) {
            try {
                const fileData = oggArchiveIndex.getFile(oggId);
                if(!fileData) {
                    oggFiles[oggId] = null;
                    logger.warn(`No file found for OGG ID ${oggId}.`);
                    continue;
                }

                oggFiles[oggId] = new OggFile(oggId, fileData.nameHash, fileData.content);
            } catch(e) {
                oggFiles[oggId] = null;
                logger.error(`Error parsing OGG ID ${oggId}.`);
                logger.error(e);
            }
        }

        return oggFiles;
    }

}
