import { Filestore } from './filestore/filestore';
import { mkdirSync, rmdirSync } from 'fs';

const filestore = new Filestore('./packed', './config');

// filestore.binaryStore.writeToDisk();

// filestore.spriteStore.writeToDisk();

const oggs = filestore.oggStore.decodeOggStore();
oggs.forEach(ogg => {
    if(ogg) {
        ogg.writeToDisk();
    }
});

async function writeMidisToDisk() {
    const midiFiles = filestore.midiStore.decodeMidiStore();
    await rmdirSync('./unpacked/midi', { recursive: true })
    await mkdirSync('./unpacked/midi');
    for(const file of midiFiles) {
        try {
            await file.writeToDisk();
        } catch(e) {}
    }
}
writeMidisToDisk();
