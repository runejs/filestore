import { Filestore } from './filestore/filestore';
import { hash } from './filestore/util/name-hash';
import {writeFileSync} from "fs";
import {PNG} from "pngjs";


const fileStore = new Filestore('C:\\Users\\displ\\Desktop\\meh', './config');
const region = fileStore.regionStore.getLandscapeFile(50, 44);
console.log(region.landscapeObjects.length);
