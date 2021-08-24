import { SpriteSheet, SpriteStorageMethod } from './sprite-sheet';
import path, { join } from 'path';
import fs, { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { ByteBuffer } from '@runejs/core/buffer';
import { ColorType, HCL, HSB, HSL, IColor, LAB, RGB, RGBA } from '../../util/colors';
import { PNG } from 'pngjs';
import { logger } from '@runejs/core';
import { ColorFrequency, ImageData } from './sprite-encoder';
import { padNumber } from '../../util/strings';
import { ColorNode, ColorQuantizer, MAX_DEPTH } from './color-quantizer';


export interface SpriteDebugSettings {
    expectedStorageMode?: SpriteStorageMethod | undefined;
    expectedTotals?: [ number, number ] | undefined;
}

const spriteDebugDir = join('.', 'output', 'debug', 'sprites');

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
        const { pixels } = imageData[imageIdx];

        const lines: string[] = new Array(height).fill('');
        let p: RGBA;

        for(let y = 0; y < height; y++) {
            for(let x = 0; x < width; x++) {
                p = pixels[y][x];
                for(let i = 0; i < colorFrequencies.length; i++) {
                    if(p.equals(colorFrequencies[i].color)) {
                        lines[y] += `${colorFrequencies[i].code} `;
                    }
                }
            }
        }

        fs.writeFileSync(path.join(outputDir, `${imageIdx}.txt`), lines.join('\n'));
    }
};


export const debugPaletteColors = (colorPalette: RGBA[], type: ColorType): string[] => {
    if(type === 'argb') {
        return [ colorPalette.map(c => c.argb).join(' ') ];
    }

    return colorPalette.map(color => {
        let c: IColor = color;

        if(type === 'hsl') {
            c = new HSL(color);
        } else if(type === 'hsb') {
            c = new HSB(color);
        } else if(type === 'hcl') {
            c = new HCL(color);
        } else if(type === 'lab') {
            c = new LAB(color);
        }

        return c.toString();
    });
};


export const debugSpritePaletteIndices = (type: SpriteStorageMethod,
                                          width: number,
                                          height: number,
                                          indexedPixels: number[],
                                          colorPalette: RGBA[]): string[] => {
    const pixelLines: string[] = new Array(height).fill('');

    if(type === 'row-major') {
        for(let y = 0; y < height; y++) {
            for(let x = 0; x < width; x++) {
                const i = width * y + x;
                pixelLines[y] += padNumber(indexedPixels[i], 2,
                    { hideEmpties: true }) + ' ';
            }
        }
    } else {
        for(let x = 0; x < width; x++) {
            for(let y = 0; y < height; y++) {
                const i = width * y + x;
                pixelLines[y] += padNumber(indexedPixels[i], 2,
                    { hideEmpties: true }) + ' ';
            }
        }
    }

    return [
        `\nARGB Int Palette:`,
        ...debugPaletteColors(colorPalette, 'argb'),
        `\n\nRGB Palette:`,
        ...debugPaletteColors(colorPalette, 'rgb'),
        `\n\nHSL Palette:`,
        ...debugPaletteColors(colorPalette, 'hsl'),
        /*`\n\nHSV Palette:`,
        ...debugPaletteColors(colorPalette, 'hsb'),
        `\n\nHCL Palette:`,
        ...debugPaletteColors(colorPalette, 'hcl'),
        `\n\nLAB Palette:`,
        ...debugPaletteColors(colorPalette, 'lab'),*/
        `\n\nType Used: ${type}`,
        `\nPixel Visualization:\n`,
        ...pixelLines
    ];
};


export const printSpritePaletteIndices = (type: SpriteStorageMethod,
                                          width: number,
                                          height: number,
                                          indexedPixels: number[],
                                          colorPalette: RGBA[]): void =>
    debugSpritePaletteIndices(type, width, height, indexedPixels, colorPalette).forEach(line => console.log(line));



const simplifyOctreeLevel = (colorNode: ColorNode, depth: number = MAX_DEPTH) => {
    const { colors, level, colorRange, pixelCount } = colorNode;
    let children = colorNode.children;

    if(level >= depth) {
        children = undefined;
    }

    return {
        level,
        colorRange,
        pixelCount,
        colors,
        children: children?.map(childNode => {
            if(!childNode) {
                return null;
            }

            return simplifyOctreeLevel(childNode);
        }) ?? []
    };
};


export const dumpOctreeData = (quantizer: ColorQuantizer): void => {
    const outputDir = path.join('.', 'output', 'debug', 'sprites-2');
    const data = JSON.stringify(simplifyOctreeLevel(quantizer.root, quantizer.depth), null, 4);

    if(!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    const bucketPaletteStr = quantizer.buckets[quantizer.depth - 1].map((bucket, i) => {
        const colorStrings = bucket.map(c => c.toString());
        let result = `Bucket ${i + 1}: [`;
        colorStrings.forEach(str => result += `\n\t${str}`);
        result += '\n]';
        return result;
    }).join('\n');

    let paletteData = bucketPaletteStr + '\n\n';

    for(let i = 0; i < quantizer.buckets.length - 1; i++) {
        paletteData += `Level ${i + 1}: ${JSON.stringify(quantizer.buckets[i], null, 4)}\n`;
    }

    const spriteSheetName = quantizer.spriteSheet.fileName.replace(/ /g, '_');

    fs.writeFileSync(path.join(outputDir, `${spriteSheetName}_palette.txt`), paletteData);
    fs.writeFileSync(path.join(outputDir, `${spriteSheetName}_octree.json`), data);
};


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

    const paletteVizHeight = 20;
    const pngData = new ByteBuffer((palette.length * 4) * paletteVizHeight);
    for(let i = 0; i < paletteVizHeight; i++) {
        palette.forEach(color => pngData.put(color?.toRgbaInt ? color.toRgbaInt() : 0, 'int'));
    }
    pngData.flipWriter();

    const png = new PNG({ width: palette.length, height: paletteVizHeight, filterType: -1 });
    pngData.copy(png.data, 0, 0);

    const paletteImageBuffer = PNG.sync.write(png.pack());
    writeFileSync(join(spriteSheetDir, `palette.png`), paletteImageBuffer);
};
