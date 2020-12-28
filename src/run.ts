import { Filestore } from './filestore/filestore';


const filestore = new Filestore('./packed', './config');


const money = filestore.configStore.items.getItem(995);

money.tradable = false;




console.log(money);
