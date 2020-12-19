import { readFileSync } from 'fs';
import { join } from 'path';

const parser = require('node-properties-parser');


export function hash(name: string): number {
    let hash: number = 0;

    for(let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }

    const overflow = hash - 2147483647;

    if(overflow > 0) {
        hash = overflow - 2147483648 - 1;
    }

    return hash;
}

export function getFileNames(dir: string) {
    return parser.parse(readFileSync(join(dir, 'file-names.properties')));
}
