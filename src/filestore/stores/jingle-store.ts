import { logger } from '@runejs/common';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';

import type { Filestore } from '../filestore';
import type { FileData } from '../file-data';


/**
 * A single OGG file object.
 */
export class OggFile {

    public constructor(public readonly fileData: FileData) {
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
                const data = this.fileData.decompress();
                writeFileSync(`./unpacked/ogg/${this.fileId}.ogg`, Buffer.from(data));
                resolve();
            } catch(error) {
                reject(error);
            }
        });
    }

    public get fileId(): number {
        return this.fileData?.fileId || -1;
    }

}


/**
 * Controls short jingle (.ogg) file storage.
 */
export class JingleStore {

    public constructor(private fileStore: Filestore) {
    }

    /**
     * Writes all unpacked OGG files to the disk under `./unpacked/ogg/`
     */
    public async writeToDisk(): Promise<void> {
        const files = this.decodeJingleStore();
        for(const ogg of files) {
            try {
                await ogg.writeToDisk();
            } catch(e) {
                logger.error(e);
            }
        }
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

        const oggArchiveIndex = this.fileStore.getIndex('jingles');
        const fileData = oggArchiveIndex.getFile(id);
        return fileData ? new OggFile(fileData) : null;
    }

    /**
     * Decodes all OGG files within the filestore.
     * @returns The list of decoded OggFile objects from the OGG store.
     */
    public decodeJingleStore(): OggFile[] {
        const oggArchiveIndex = this.fileStore.getIndex('jingles');
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

                oggFiles[oggId] = new OggFile(fileData);
            } catch(e) {
                oggFiles[oggId] = null;
                logger.error(`Error parsing OGG ID ${oggId}.`);
                logger.error(e);
            }
        }

        return oggFiles;
    }

}
