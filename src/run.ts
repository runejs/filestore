import { Filestore } from './filestore';
import { logger } from '@runejs/common';

const fileStore = new Filestore('./packed', { configDir: './config' });
const region = fileStore.regionStore.getLandscapeFile(50, 44);
logger.info(JSON.stringify(region, null, 2));

fileStore.widgetStore.writeToDisk();
