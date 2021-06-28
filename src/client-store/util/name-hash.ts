import { readFileSync } from 'fs';
import { join } from 'path';


export function hashFileName(str: string): number {
    /*let hash = 0;
    for(let i = 0; i < name.length; i++) {
        hash = Math.imul(31, hash) + name.charCodeAt(i) | 0;
    }

    return hash;*/
    let hash = 0;

    for(let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }

    return hash | 0;
}

export function getFileNames(dir: string) {
    return {
        ...JSON.parse(readFileSync(join(dir, 'file-names.json'), 'utf-8')),
        ...JSON.parse(readFileSync(join(dir, 'map-file-names.json'), 'utf-8'))
    };
}
