import { Filestore } from './filestore/filestore';


const filestore = new Filestore('./packed', './config');

filestore.spriteStore.writeToDisk();
