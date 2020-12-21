import { Filestore, getFileName } from '../filestore';
import { ByteBuffer, logger } from '@runejs/core';
import { hash } from '../util/name-hash';
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
     * Writes this unpacked OGG file to the disk under `./unpacked/ogg/{oggFileName}.ogg`
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
     * @param nameOrId The name or ID of the OGG file.
     * @returns The decoded OggFile object, or null if the file is not found.
     */
    public getOgg(nameOrId: string | number): OggFile | null {
        if(!nameOrId) {
            return null;
        }

        const oggArchiveIndex = this.fileStore.getIndex('ogg');

        if(typeof nameOrId === 'string') {
            const packCount = oggArchiveIndex.archives.size;
            const nameHash = hash(nameOrId);
            for(let oggId = 0; oggId < packCount; oggId++) {
                try {
                    const archive = oggArchiveIndex.getArchive(oggId, false);
                    if(!archive) {
                        continue;
                    }

                    if(nameHash === archive.nameHash) {
                        return new OggFile(oggId, archive.nameHash, archive.content);
                    }
                } catch(e) {}
            }
        } else {
            const archive = oggArchiveIndex.getArchive(nameOrId, false);
            if(archive) {
                return new OggFile(nameOrId, archive.nameHash, archive.content);
            }
        }

        return null;
    }

    /**
     * Decodes all OGG files within the filestore.
     * @returns The list of decoded OggFile objects from the OGG store.
     */
    public decodeOggStore(): OggFile[] {
        const oggArchiveIndex = this.fileStore.getIndex('ogg');
        const fileCount = oggArchiveIndex.archives.size;
        const oggFiles: OggFile[] = new Array(fileCount);

        for(let oggId = 0; oggId < fileCount; oggId++) {
            try {
                const archive = oggArchiveIndex.getArchive(oggId, false);
                if(!archive) {
                    oggFiles[oggId] = null;
                    logger.warn(`No archive found for OGG ID ${oggId}.`);
                    continue;
                }

                oggFiles[oggId] = new OggFile(oggId, archive.nameHash, archive.content);
            } catch(e) {
                oggFiles[oggId] = null;
                logger.error(`Error parsing OGG ID ${oggId}.`);
                logger.error(e);
            }
        }

        return oggFiles;
    }

}
