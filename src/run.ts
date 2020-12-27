import { Filestore } from './filestore/filestore';


const filestore = new Filestore('./packed', './config');

console.log(filestore.configStore.items.decodeItemStore()[995]);
