import { Store } from './fs';
import { join } from 'path';


const store = new Store(435, join('..', 'store'), join('..', 'store', 'output'));

console.log(store.hashFileName('cabbage'));
