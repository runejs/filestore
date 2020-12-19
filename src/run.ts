import { Filestore } from './filestore/filestore';
import { mkdirSync, rmdirSync } from 'fs';

const filestore = new Filestore('./packed', './config');

/*const midiFiles = filestore.midiStore.decodeMidiStore();

async function writeMidisToDisk() {
    await rmdirSync('./unpacked/midi', { recursive: true })
    await mkdirSync('./unpacked/midi');
    for(const file of midiFiles) {
        try {
            await file.writeToDisk();
        } catch(e) {}
    }
}*/

// filestore.binaryStore.writeToDisk();

filestore.spriteStore.writeToDisk();

// writeMidisToDisk();
