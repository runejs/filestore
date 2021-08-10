import { SpriteSheet, SpriteStorageMethod } from './sprite-sheet';
import { join } from 'path';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { ByteBuffer } from '@runejs/core/buffer';
import { RGBA } from '../../util/colors';
import { PNG } from 'pngjs';
import { logger } from '@runejs/core';
import fs from 'fs';
import path from 'path';
import { ColorFrequency, ImageData } from './sprite-encoder';


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


export const debugHuffmanTree = (fileName: string, width: number, height: number,
                                 imageData: ImageData[], colorFrequencies: ColorFrequency[]): void => {
    const outputDir = path.join('.', 'output', 'debug', 'sprites-2', fileName);

    if(fs.existsSync(outputDir)) {
        fs.rmSync(outputDir, { recursive: true, force: true });
    }

    fs.mkdirSync(outputDir, { recursive: true });

    for(let imageIdx = 0; imageIdx < imageData.length; imageIdx++) {
        const { intensities } = imageData[imageIdx];

        const lines: string[] = new Array(height).fill('');
        let intensity;

        for(let y = 0; y < height; y++) {
            for(let x = 0; x < width; x++) {
                intensity = intensities[y][x];
                for(let i = 0; i < colorFrequencies.length; i++) {
                    if(intensity === colorFrequencies[i].intensity) {
                        lines[y] += `${colorFrequencies[i].code} `;
                    }
                }
            }
        }

        fs.writeFileSync(path.join(outputDir, `${imageIdx}.txt`), lines.join('\n'));
    }
};


export const debugSpritePaletteIndices = (type: SpriteStorageMethod,
                                          width: number,
                                          height: number,
                                          indexedPixels: number[],
                                          colorPalette: number[]): string[] => {
    const pixelLines: string[] = new Array(height).fill('');

    if(type === 'row-major') {
        for(let y = 0; y < height; y++) {
            for(let x = 0; x < width; x++) {
                const i = width * y + x;
                pixelLines[y] += pad(indexedPixels[i], 2) + ' ';
            }
        }
    } else {
        for(let x = 0; x < width; x++) {
            for(let y = 0; y < height; y++) {
                const i = width * y + x;
                pixelLines[y] += pad(indexedPixels[i], 2) + ' ';
            }
        }
    }

    return [
        `\nPalette:`, colorPalette.join(' '),
        `\nType Used: ${type}`,
        `\nPixel Visualization:\n`,
        ...pixelLines
    ];
};


export const printSpritePaletteIndices = (type: SpriteStorageMethod,
                                          width: number,
                                          height: number,
                                          indexedPixels: number[],
                                          colorPalette: number[]): void =>
    debugSpritePaletteIndices(type, width, height, indexedPixels, colorPalette).forEach(line => console.log(line));


export const dumpSpriteSheetData = (spriteSheet: SpriteSheet): void => {
    const { fileName, palette, sprites } = spriteSheet;

    const spriteSheetDir = createSpriteSheetDebugDirectory(fileName);

    sprites.forEach(sprite => {
        try {
            const { spriteIndex, width, height, paletteIndices } = sprite;
            const pixelDebugData: string[] =
                debugSpritePaletteIndices(sprite.storageMethod, width, height, paletteIndices, palette);
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
