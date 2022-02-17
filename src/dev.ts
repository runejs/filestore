import { Store } from './fs';
import { join } from 'path';


const store = Store.create(435, join('..', 'store'), join('..', 'store', 'output'));

