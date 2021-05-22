import { readFileSync } from 'fs';
import { join } from 'path';


export function hash(name: string): number {
    let hash = 0;
    for(let i = 0; i < name.length; i++) {
        hash = Math.imul(31, hash) + name.charCodeAt(i) | 0;
    }

    return hash;
}

export function getFileNames(dir: string) {
    return {
        ...JSON.parse(readFileSync(join(dir, 'file-names.json'), 'utf-8')),
        ...JSON.parse(readFileSync(join(dir, 'map-file-names.json'), 'utf-8'))
    };
}
