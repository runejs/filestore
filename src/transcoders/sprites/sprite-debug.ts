import { SpriteSheet, SpriteStorageMethod } from './sprite-sheet';
import path, { join } from 'path';
import fs, { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { ByteBuffer } from '@runejs/core/buffer';
import { ColorType, HCL, HSB, HSL, IColor, LAB, RGBA, padNumber } from '../../util';
import { PNG } from 'pngjs';
import { logger } from '@runejs/core';
import { ColorNode, ColorQuantizer, MAX_DEPTH } from './color-quantizer';
import spriteCodec from './sprite.transcoder';


const spriteDebugDir = join('.', 'output', 'debug', 'sprites');


const createSpriteSheetDebugDirectory = (fileName: string): string => {
    const spriteSheetDir = join(spriteDebugDir, fileName);
    if(existsSync(spriteSheetDir)) {
        rmSync(spriteSheetDir, { recursive: true, force: true });
    }

    mkdirSync(spriteSheetDir, { recursive: true });
    return spriteSheetDir;
};


export const debugPaletteColors = (colorPalette: RGBA[], type: ColorType, colorUses?: number[]): string[] =>
    [ `\n${type.toString().toUpperCase()} Palette:`, ...colorPalette.map((color, i) => {
        let c: IColor = color;

        if(type !== 'argb') {
            if(type === 'hsl') {
                c = new HSL(color);
            } else if(type === 'hsb') {
                c = new HSB(color);
            } else if(type === 'hcl') {
                c = new HCL(color);
            } else if(type === 'lab') {
                c = new LAB(color);
            }
        }

        let result = type === 'argb' ? String(color.argb) : c.toString();

        if(colorUses?.length) {
            result += ` Uses: ${colorUses[i]}`
        }

        return result;
    }), '\n' ];


export const debugSpritePaletteIndices = (type: SpriteStorageMethod,
                                          width: number,
                                          height: number,
                                          indexedPixels: number[],
                                          colorPalette: RGBA[]): string[] => {
    const pixelLines: string[] = new Array(height).fill('');

    const pixelUses: number[] = new Array(colorPalette.length).fill(0);

    const addIndex = (width: number, x: number, y: number): void => {
        const i = width * y + x;
        const colorIndex = indexedPixels[i];
        pixelUses[colorIndex]++;
        pixelLines[y] += padNumber(colorIndex, 2, { hideEmpties: true }) + ' ';
    };

    if(type === 'row-major') {
        for(let y = 0; y < height; y++) {
            for(let x = 0; x < width; x++) {
                addIndex(width, x, y);
            }
        }
    } else {
        for(let x = 0; x < width; x++) {
            for(let y = 0; y < height; y++) {
                addIndex(width, x, y);
            }
        }
    }

    const debugPaletteTypes: ColorType[] = [
        'argb', 'rgb', 'hsl'// , 'hsb', 'lab'
    ];

    return [
        ...debugPaletteTypes.map(type => debugPaletteColors(colorPalette, type, pixelUses))
            .reduce((prev, curr) => [ ...prev, ...curr ]),
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
    debugSpritePaletteIndices(type, width, height, indexedPixels, colorPalette).forEach(line => logger.info(line));



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
        const colorStrings = bucket?.colors.map(c => c.toString());
        let result = `Bucket ${i + 1}: [`;
        colorStrings.forEach(str => result += `\n\t${str}`);
        result += '\n]';
        return result;
    }).join('\n');

    let paletteData = bucketPaletteStr + '\n\n';

    for(let i = 0; i < quantizer.buckets.length - 1; i++) {
        paletteData += `Level ${i + 1}: ${JSON.stringify(quantizer.buckets[i].map(node => node?.colors), null, 4)}\n`;
    }

    const spriteSheetName = quantizer.spriteSheet.fileInfo.fileName.replace(/ /g, '_');

    fs.writeFileSync(path.join(outputDir, `${spriteSheetName}_palette.txt`), paletteData);
    fs.writeFileSync(path.join(outputDir, `${spriteSheetName}_octree.json`), data);
};


export const dumpSpriteSheetData = (spriteSheet: SpriteSheet): void => {
    const { fileInfo: { fileName }, palette, sprites } = spriteSheet;

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


export const validateSpriteFormats = (debugDir: string): void => {
    logger.info('\n\nChecking column-major files...');

    const debug = true;

    let columnCorrect: number = 0;
    let columnIncorrect: number = 0;
    let spriteFiles = fs.readdirSync(path.join(debugDir, 'sprites-column-major'))
        .filter(fileName => fileName.endsWith('.png'));

    for(let i = 0; i < spriteFiles.length; i++) {
        const spriteFile: Buffer = fs.readFileSync(path.join(debugDir, 'sprites-column-major', spriteFiles[i]));
        const result = spriteCodec.encode({
            fileIndex: i,
            fileName: spriteFiles[i].replace('.png', '')
        }, spriteFile, {
            debug,
            forceStorageMethod: 'column-major'
        });

        if(result === null) {
            columnIncorrect++;
        } else {
            columnCorrect++;
        }
    }

    const columnTotal = columnCorrect + columnIncorrect;
    const columnPercentRight = Math.round((columnCorrect / columnTotal) * 100);

    let rowCorrect = 0;
    let rowIncorrect = 0;

    logger.info('\n\nChecking row-major files...');

    spriteFiles = fs.readdirSync(path.join(debugDir, 'sprites-row-major'))
        .filter(fileName => fileName.endsWith('.png'));

    for(let i = 0; i < spriteFiles.length; i++) {
        const spriteFile: Buffer = fs.readFileSync(path.join(debugDir, 'sprites-row-major', spriteFiles[i]));
        const result = spriteCodec.encode({
            fileIndex: i,
            fileName: spriteFiles[i].replace('.png', '')
        }, spriteFile, {
            debug,
            forceStorageMethod: 'row-major'
        });

        if(result === null) {
            rowIncorrect++;
        } else {
            rowCorrect++;
        }
    }

    const rowTotal = rowCorrect + rowIncorrect;
    const rowPercentRight = Math.round((rowCorrect / rowTotal) * 100);

    logger.info('');
    logger.info(`Row-Major: ${rowPercentRight}% (${rowCorrect}:${rowIncorrect} of ${rowTotal})`);
    logger.info(`Column-Major: ${columnPercentRight}% (${columnCorrect}:${columnIncorrect} of ${columnTotal})`);
    logger.info('');
};
