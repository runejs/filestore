import { Filestore } from './filestore/filestore';

const filestore = new Filestore('./packed', './config');

const midiFiles = filestore.midiStore.decodeMidiStore();

async function writeMidisToDisk() {
    for(const file of midiFiles) {
        try {
            await file.writeToDisk();
        } catch(e) {}
    }
}

writeMidisToDisk();
