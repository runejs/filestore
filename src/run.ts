import { Filestore } from './filestore/filestore';
import { hash } from './filestore/util/name-hash';


const filestore = new Filestore('./packed', './config');

const pack = filestore.spriteStore.getSpritePack(645);
pack.decode();

console.log(pack.fileData.whirlpool);

const nameHash = pack.fileData.nameHash;

const letters = 'abcdefghijklmnopqrstuvwxyz'.split('');

function find() {
    const packs = filestore.spriteStore.decodeSpriteStore();
    for(const letter of letters) {
        for(let i = 0; i < 100; i++) {
            const str = `${letter}${ i === 0 ? '' : i }_full`;
            const hashed = hash(str);
            if(packs.find(pack => pack && pack.fileData.nameHash === hashed)) {
                console.log(`${hashed} = ${str}`);
            }
        }
    }
}

//find();
