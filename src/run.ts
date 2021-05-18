import { Filestore } from './filestore';


const fileStore = new Filestore('./packed', { configDir: './config' });

fileStore.getAllIndexes().forEach(index => index.writeFilesToStore());
