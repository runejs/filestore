import { Filestore } from './filestore/filestore';
import { logger } from '@runejs/core';


const filestore = new Filestore('./packed', './config');
logger.info(JSON.stringify(filestore.configStore.objectStore.getObject(1307)));
