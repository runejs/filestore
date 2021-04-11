import { Filestore } from './filestore/filestore';
import { logger } from '@runejs/core';


const fileStore = new Filestore('./packed', { configDir: './config' });
const region = fileStore.regionStore.getLandscapeFile(50, 44);
console.log(region.landscapeObjects.length);
