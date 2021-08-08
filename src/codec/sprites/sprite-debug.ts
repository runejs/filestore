import { SpriteSheet, SpriteStorageMethod } from './sprite-sheet';
import { join } from 'path';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { ByteBuffer } from '@runejs/core/buffer';
import { RGBA } from '../../util/colors';
import { PNG } from 'pngjs';
import { logger } from '@runejs/core';


export interface SpriteDebugSettings {
    expectedStorageMode?: SpriteStorageMethod | undefined;
    expectedTotals?: [ number, number ] | undefined;
}

const spriteDebugDir = join('.', 'output', 'debug', 'sprites');

const pad = (i, amt): string => {
    if(i === 0) {
        return new Array(amt).fill(' ').join('');
    }
    const s = `${i}`;
    if(s.length < amt) {
        return new Array(amt - s.length).fill(' ').join('') + s;
    }
    return s;
};

const createSpriteSheetDebugDirectory = (fileName: string): string => {
    const spriteSheetDir = join(spriteDebugDir, fileName);
    if(existsSync(spriteSheetDir)) {
        rmSync(spriteSheetDir, { recursive: true, force: true });
    }

    mkdirSync(spriteSheetDir, { recursive: true });
    return spriteSheetDir;
};


export const debugSpritePaletteIndices = (type: SpriteStorageMethod,
                                          palette: number[],
                                          width: number,
                                          height: number,
                                          paletteIndices: number[]): string[] => {
    const pixelLines: string[] = new Array(height);

    for(let y = 0; y < height; y++) {
        pixelLines[y] = ``;
        for(let x = 0; x < width; x++) {
            const i = width * y + x;
            pixelLines[y] += pad(paletteIndices[i], 2) + ' ';
        }
    }

    return [
        `\nPalette:`, palette.join(' '),
        `\nDetected:`, type,
        `\nPixel Visualization:\n`,
        ...pixelLines
    ];
};


export const printSpritePaletteIndices = (type: SpriteStorageMethod,
                                          palette: number[],
                                          width: number,
                                          height: number,
                                          paletteIndices: number[]): void => {
    debugSpritePaletteIndices(type, palette, width, height, paletteIndices).forEach(line => console.log(line));
};


export const dumpSpriteSheetData = (spriteSheet: SpriteSheet): void => {
    const { fileName, palette, sprites } = spriteSheet;

    const spriteSheetDir = createSpriteSheetDebugDirectory(fileName);

    sprites.forEach(sprite => {
        try {
            const { spriteIndex, width, height, paletteIndices } = sprite;
            const pixelDebugData: string[] =
                debugSpritePaletteIndices(sprite.storageMethod, palette, width, height, paletteIndices);
            writeFileSync(join(spriteSheetDir, `${spriteIndex}.txt`), pixelDebugData.join('\n'));
        } catch(error) {
            logger.error(`Error dumping sprite pixel data:`, error);
        }
    });

    const pngData = new ByteBuffer(palette.length * 4);
    palette.forEach(color => pngData.put(new RGBA(color).toInt(), 'int'));
    pngData.flipWriter();

    const png = new PNG({ width: palette.length, height: 1, filterType: -1 });
    pngData.copy(png.data, 0, 0);

    const paletteImageBuffer = PNG.sync.write(png.pack());
    writeFileSync(join(spriteSheetDir, `palette.png`), paletteImageBuffer);
};
