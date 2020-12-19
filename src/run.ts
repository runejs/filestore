import { Filestore } from './filestore/filestore';

const filestore = new Filestore('./packed', './config');

filestore.midiStore.getMidi('harmony').writeToDisk();
