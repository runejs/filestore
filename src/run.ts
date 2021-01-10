import { Filestore } from './filestore/filestore';


const filestore = new Filestore('./packed', './config');

const font = filestore.fontStore.fonts.q8_full;

console.log(font.drawString('hello world!', 0x244BDC));

//filestore.spriteStore.getSpritePack('mapback').decode().sprites[0].toBase64().then(console.log);

