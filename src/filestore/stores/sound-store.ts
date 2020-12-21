import { Filestore } from '../filestore';
import { ByteBuffer, logger } from '@runejs/core';
import { existsSync, mkdirSync, writeFileSync } from 'fs';


/**
 * A single sound file object.
 */
export class SoundFile {

    public fileId: number;
    public nameHash: number;
    public content: ByteBuffer;

    public constructor(fileId: number, nameHash: number, content: ByteBuffer) {
        this.fileId = fileId;
        this.nameHash = nameHash;
        this.content = content;
    }

    /**
     * Writes this unpacked sound file to the disk under `./unpacked/sounds/{soundId}.ogg`
     */
    public async writeToDisk(): Promise<void> {
        return new Promise((resolve, reject) => {
            try {
                if(!existsSync('./unpacked/sounds')) {
                    mkdirSync('./unpacked/sounds');
                }
                writeFileSync(`./unpacked/sounds/${this.fileId}.wav`, Buffer.from(this.content));
                resolve();
            } catch(error) {
                reject(error);
            }
        });
    }

}


/**
 * Controls sound file storage.
 */
export class SoundStore {

    private readonly fileStore: Filestore;

    public constructor(fileStore: Filestore) {
        this.fileStore = fileStore;
    }

    /**
     * Decodes the specified sound file.
     * @param id The ID of the sound file.
     * @returns The decoded SoundFile object, or null if the file is not found.
     */
    public getSound(id: number): SoundFile | null {
        if(id === undefined || id === null) {
            return null;
        }

        const soundArchiveIndex = this.fileStore.getIndex('sounds');
        const archive = soundArchiveIndex.getArchive(id, false);
        return archive ? new SoundFile(id, archive.nameHash, archive.content) : null;
    }

    /**
     * Decodes all WAV files within the filestore.
     * @returns The list of decoded SoundFile objects from the sound store.
     */
    public decodeSoundStore(): SoundFile[] {
        const soundArchiveIndex = this.fileStore.getIndex('sounds');
        const fileCount = soundArchiveIndex.archives.size;
        const soundFiles: SoundFile[] = new Array(fileCount);

        for(let soundId = 0; soundId < fileCount; soundId++) {
            try {
                const archive = soundArchiveIndex.getArchive(soundId, false);
                if(!archive) {
                    soundFiles[soundId] = null;
                    logger.warn(`No archive found for sound ID ${soundId}.`);
                    continue;
                }

                soundFiles[soundId] = new SoundFile(soundId, archive.nameHash, archive.content);
            } catch(e) {
                soundFiles[soundId] = null;
                logger.error(`Error parsing sound ID ${soundId}.`);
                logger.error(e);
            }
        }

        return soundFiles;
    }

}
