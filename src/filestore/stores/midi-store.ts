import { Filestore, getFileName } from '../filestore';
import { ByteBuffer, logger } from '@runejs/core';
import { hash } from '../util/name-hash';
import { writeFileSync } from 'fs';


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

        if(typeof nameOrId === 'string') {
            const packCount = midiArchiveIndex.archives.size;
            const nameHash = hash(nameOrId);
            for(let midiId = 0; midiId < packCount; midiId++) {
                try {
                    const archive = midiArchiveIndex.getArchive(midiId, false);
                    if(!archive) {
                        continue;
                    }

                    if(nameHash === archive.nameHash) {
                        return new MidiFile(midiId, archive.nameHash, archive.content);
                    }
                } catch(e) {}
            }
        } else {
            const archive = midiArchiveIndex.getArchive(nameOrId, false);
            if(archive) {
                return new MidiFile(nameOrId, archive.nameHash, archive.content);
            }
        }

        return null;
    }

    /**
     * Decodes all midi files within the filestore.
     * @returns The list of decoded MidiFile objects from the midi store.
     */
    public decodeMidiStore(): MidiFile[] {
        const midiArchiveIndex = this.fileStore.getIndex('midi');
        const fileCount = midiArchiveIndex.archives.size;
        const midiFiles: MidiFile[] = new Array(fileCount);

        for(let midiId = 0; midiId < fileCount; midiId++) {
            try {
                const archive = midiArchiveIndex.getArchive(midiId, false);
                if(!archive) {
                    midiFiles[midiId] = null;
                    logger.warn(`No archive found for midi ID ${midiId}.`);
                    continue;
                }

                midiFiles[midiId] = new MidiFile(midiId, archive.nameHash, archive.content);
            } catch(e) {
                midiFiles[midiId] = null;
                logger.error(`Error parsing midi ID ${midiId}.`);
                logger.error(e);
                continue;
            }
        }

        return midiFiles;
    }

}
