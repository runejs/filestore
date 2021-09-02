import { logger } from '@runejs/core';
import { existsSync, mkdirSync, writeFileSync } from 'fs';

import { ClientFileStore } from '../client-file-store';
import { ClientFile } from '../client-file';
import { Store } from './store';


/**
 * A single sound file object.
 */
export class SoundFile {

    public constructor(public readonly fileData: ClientFile) {
    }

    /**
     * Writes this unpacked sound file to the disk under `./unpacked/sounds/{soundId}.wav`
     */
    public async writeToDisk(): Promise<void> {
        return new Promise((resolve, reject) => {
            try {
                if(!existsSync('./unpacked/sounds')) {
                    mkdirSync('./unpacked/sounds');
                }
                const data = this.fileData.decompress();
                writeFileSync(`./unpacked/sounds/${this.fileId}.wav`, Buffer.from(data));
                resolve();
            } catch(error) {
                reject(error);
            }
        });
    }

    public get fileId(): number {
        return this.fileData?.fileIndex || -1;
    }

}


/**
 * Controls sound file storage.
 */
export class SoundStore extends Store {

    public constructor(fileStore: ClientFileStore) {
        super(fileStore, 'synth_sounds');
    }

    /**
     * Writes all unpacked WAV files to the disk under `./unpacked/sounds/`
     */
    public async writeToDisk(): Promise<void> {
        const files = this.decodeSoundStore();
        for(const wav of files) {
            try {
                await wav.writeToDisk();
            } catch(e) {
                logger.error(e);
            }
        }
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

        const soundArchiveIndex = this.clientArchive;
        const fileData = soundArchiveIndex.groups.get(id);
        return fileData ? new SoundFile(fileData) : null;
    }

    /**
     * Decodes all WAV files within the filestore.
     * @returns The list of decoded SoundFile objects from the sound store.
     */
    public decodeSoundStore(): SoundFile[] {
        const soundArchiveIndex = this.clientArchive;
        const fileCount = soundArchiveIndex.groups.size;
        const soundFiles: SoundFile[] = new Array(fileCount);

        for(let soundId = 0; soundId < fileCount; soundId++) {
            try {
                const fileData = soundArchiveIndex.getFile(soundId);
                if(!fileData) {
                    soundFiles[soundId] = null;
                    logger.warn(`No file found for sound ID ${soundId}.`);
                    continue;
                }

                soundFiles[soundId] = new SoundFile(fileData);
            } catch(e) {
                soundFiles[soundId] = null;
                logger.error(`Error parsing sound ID ${soundId}.`);
                logger.error(e);
            }
        }

        return soundFiles;
    }

}
