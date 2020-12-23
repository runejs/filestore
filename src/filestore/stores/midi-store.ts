import { Filestore, getFileName } from '../filestore';
import { ByteBuffer, logger } from '@runejs/core';
import { existsSync, mkdirSync, writeFileSync } from 'fs';


/**
 * A single MIDI file object.
 */
export class MidiFile {

    public fileId: number;
    public nameHash: number;
    public content: ByteBuffer;

    public constructor(fileId: number, nameHash: number, content: ByteBuffer) {
        this.fileId = fileId;
        this.nameHash = nameHash;
        this.content = content;
    }

    /**
     * Writes this unpacked MIDI file to the disk under `./unpacked/midi/{midiFileName}.mid`
     */
    public async writeToDisk(): Promise<void> {
        return new Promise((resolve, reject) => {
            try {
                const fileName = getFileName(this.nameHash).replace(/ /g, '_');
                if(!existsSync('./unpacked/midi')) {
                    mkdirSync('./unpacked/midi');
                }
                writeFileSync(`./unpacked/midi/${this.fileId}_${fileName}.mid`, Buffer.from(this.content));
                resolve();
            } catch(error) {
                reject(error);
            }
        });
    }

}


/**
 * Controls MIDI file storage.
 */
export class MidiStore {

    private readonly fileStore: Filestore;

    public constructor(fileStore: Filestore) {
        this.fileStore = fileStore;
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

        const midiArchiveIndex = this.fileStore.getIndex('midi');
        const fileData = midiArchiveIndex.getFile(nameOrId);

        return fileData ? new MidiFile(fileData.fileId, fileData.nameHash, fileData.content) : null;
    }

    /**
     * Decodes all midi files within the filestore.
     * @returns The list of decoded MidiFile objects from the midi store.
     */
    public decodeMidiStore(): MidiFile[] {
        const midiArchiveIndex = this.fileStore.getIndex('midi');
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

                midiFiles[midiId] = new MidiFile(midiId, fileData.nameHash, fileData.content);
            } catch(e) {
                midiFiles[midiId] = null;
                logger.error(`Error parsing midi ID ${midiId}.`);
                logger.error(e);
            }
        }

        return midiFiles;
    }

}
