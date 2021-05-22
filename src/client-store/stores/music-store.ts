import { logger } from '@runejs/core';
import { existsSync, mkdirSync, writeFileSync } from 'fs';

import { ClientFileStore, getFileName } from '../client-file-store';
import { FileData } from '../file-data';


/**
 * A single MIDI file object.
 */
export class MidiFile {

    public constructor(public readonly fileData: FileData) {
    }

    /**
     * Writes this unpacked MIDI file to the disk under `./unpacked/midi/{midiFileName}.mid`
     */
    public async writeToDisk(): Promise<void> {
        return new Promise((resolve, reject) => {
            try {
                const fileName = getFileName(this.fileData.nameHash).replace(/ /g, '_');
                if(!existsSync('./unpacked/midi')) {
                    mkdirSync('./unpacked/midi');
                }
                const data = this.fileData.decompress();
                writeFileSync(`./unpacked/midi/${this.fileId}_${fileName}.mid`, Buffer.from(data));
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
 * Controls MIDI file storage.
 */
export class MusicStore {

    public constructor(private fileStore: ClientFileStore) {
    }

    /**
     * Writes all unpacked MIDI files to the disk under `./unpacked/midi/`
     */
    public async writeToDisk(): Promise<void> {
        const files = this.decodeMusicStore();
        for(const midi of files) {
            try {
                await midi.writeToDisk();
            } catch(e) {
                logger.error(e);
            }
        }
    }

    /**
     * Decodes the specified midi file.
     * @param nameOrId The name or ID of the midi file.
     * @returns The decoded MidiFile object, or null if the file is not found.
     */
    public getMidi(nameOrId: string | number): MidiFile | null {
        if(!nameOrId) {
            return null;
        }

        const midiArchiveIndex = this.fileStore.getIndex('music');
        const fileData = midiArchiveIndex.getFile(nameOrId);

        return fileData ? new MidiFile(fileData) : null;
    }

    /**
     * Decodes all midi files within the filestore.
     * @returns The list of decoded MidiFile objects from the midi store.
     */
    public decodeMusicStore(): MidiFile[] {
        const midiArchiveIndex = this.fileStore.getIndex('music');
        const fileCount = midiArchiveIndex.files.size;
        const midiFiles: MidiFile[] = new Array(fileCount);

        for(let midiId = 0; midiId < fileCount; midiId++) {
            try {
                const fileData = midiArchiveIndex.getFile(midiId);
                if(!fileData) {
                    midiFiles[midiId] = null;
                    logger.warn(`No file found for midi ID ${midiId}.`);
                    continue;
                }

                midiFiles[midiId] = new MidiFile(fileData);
            } catch(e) {
                midiFiles[midiId] = null;
                logger.error(`Error parsing midi ID ${midiId}.`);
                logger.error(e);
            }
        }

        return midiFiles;
    }

}
