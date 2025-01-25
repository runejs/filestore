import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const parser = require('properties-parser');

export function hash(name: string): number {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = (Math.imul(31, hash) + name.charCodeAt(i)) | 0;
    }

    return hash;
}

export function getFileNames(dir: string) {
    return parser.parse(readFileSync(join(dir, 'file-names.properties')));
}
