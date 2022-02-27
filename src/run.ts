import { Filestore } from './filestore';
import { logger } from '@runejs/common';


const fileStore = new Filestore('./packed', { configDir: './config' });
const region = fileStore.regionStore.getLandscapeFile(50, 44);
logger.info(region.landscapeObjects.length);

fileStore.widgetStore.writeToDisk();
