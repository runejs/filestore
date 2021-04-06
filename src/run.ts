import { Filestore } from './filestore/filestore';
import { logger } from '@runejs/core';


const filestore = new Filestore('./packed', './config');
logger.info(JSON.stringify(filestore.configStore.npcStore.getNpc(2)));
logger.info(JSON.stringify(filestore.configStore.npcStore.getNpc(2)));
