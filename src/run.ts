import { Filestore } from './filestore/filestore';


const filestore = new Filestore('./packed', './config');

console.log(JSON.stringify(filestore.configStore.items.getItem(995)));
