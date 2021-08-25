import { PNG } from 'pngjs';
import { SpriteSheet } from './sprite-sheet';
import { ByteBuffer } from '@runejs/core/buffer';
import { HSL, IColor, RGB, RGBA } from '../../util/colors';
import { dumpOctreeData, printSpritePaletteIndices } from './sprite-debug';
import { frequencySorter, colorSorter, sortPalette } from './sorter';
import { SpriteCodecOptions } from './sprite.codec';
import { ColorQuantizer } from './color-quantizer';


export type ColorUsageMap = { [key: number]: ColorUsage };

export type RgbRange = { rgb: number, count: number };
export type AlphaRange = { alpha: number, count: number };


export class ColorUsage {

    public rgb: number;
    public rangeCount: number = 1;
    public totalUses: number = 1;

    public constructor(rgb: number, totalUses: number) {
        this.rgb = rgb;
        this.totalUses = totalUses;
    }

    public get average(): number {
        return (this.totalUses || 1) / (this.rangeCount || 1);
    }

}

export interface ImageData {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    pixels: RGBA[][];
    hasAlpha: boolean;
    width?: number;
    height?: number;
}

export interface ColorFrequency {
    color: RGBA;
    frequency: number;
    left: ColorFrequency;
    right: ColorFrequency;
    code: string;
}


const generateHuffCode = (root: ColorFrequency, s: string, values: RGBA[]): void => {
    if(!root.left && !root.right) {
        root.code = s;
        values.push(root.color);
    } else {
        generateHuffCode(root.left, `${s}0`, values);
        generateHuffCode(root.right, `${s}1`, values);
    }
};


function sortQueue(nodeQueue: ColorFrequency[], usageMap: ColorUsageMap): ColorFrequency[] {
    return nodeQueue.sort((a: ColorFrequency, b: ColorFrequency) => frequencySorter(a, b, usageMap));
}


const addToQueue = (nodeQueue: ColorFrequency[], color: ColorFrequency, usageMap: ColorUsageMap): void => {
    nodeQueue.push(color);
    sortQueue(nodeQueue, usageMap);
};


const mapColorUsage = (ranges: RgbRange[]): ColorUsageMap => {
    const usageMap: ColorUsageMap = {};

    for(const range of ranges) {
        if(range.rgb === 0) {
            continue;
        }

        const colorUsage = usageMap[range.rgb];

        if(!colorUsage) {
            usageMap[range.rgb] = new ColorUsage(range.rgb, range.count);
        } else {
            colorUsage.rangeCount++;
            colorUsage.totalUses += range.count;
        }
    }

    return usageMap;
};

const addPixelRangeData = (rgba: RGBA, rgbRanges: RgbRange[], alphaRanges: AlphaRange[]): void => {
    if(!rgbRanges?.length) {
        rgbRanges.push({ rgb: rgba.argb, count: 1 });
        alphaRanges.push({ alpha: rgba.alpha, count: 1 });
    } else {
        const lastEntry = rgbRanges[rgbRanges.length - 1];
        if(lastEntry && lastEntry.rgb === rgba.argb) {
            lastEntry.count++;
        } else {
            rgbRanges.push({ rgb: rgba.argb, count: 1 });
        }

        const lastAlphaEntry = alphaRanges[alphaRanges.length - 1];
        if(lastAlphaEntry && lastAlphaEntry.alpha === rgba.alpha) {
            lastAlphaEntry.count++;
        } else {
            alphaRanges.push({ alpha: rgba.alpha, count: 1 });
        }
    }
};


const generateHuffmanTree = (nodeQueue: ColorFrequency[],
                             frequencies: ColorFrequency[],
                             usageMap: ColorUsageMap): { rootNode: ColorFrequency, colorPalette: RGBA[] } => {
    sortQueue(nodeQueue, usageMap);

    let root: ColorFrequency = null;

    while(nodeQueue.length > 1) {
        const left = nodeQueue.shift();
        const right = nodeQueue.shift();

        const frequency = right.frequency + left.frequency;
        const color = right.color.argb + left.color.argb;

        root = {
            color: new RGBA(color),
            frequency,
            left,
            right,
            code: '-'
        };

        addToQueue(nodeQueue, root, usageMap);
    }

    const sortedPalette: RGBA[] = [];
    generateHuffCode(root, '', sortedPalette);

    /*const blackColorIdx = sortedRowPalette.indexOf(1);
    if(blackColorIdx > 0) {
        // Shift black back to the start of the color palette if it ended up out of order
        sortedRowPalette.splice(sortedRowPalette.indexOf(1), 1);
        sortedRowPalette.unshift(1);
    }*/

    /*sortedPalette.sort((a, b) => colorSorter(a, b));

    if(appendBlack) {
        sortedPalette.unshift(1);
    }

    sortedPalette.unshift(0);*/

    return { rootNode: root, colorPalette: sortedPalette };
};



const readImageData = (spriteSheet: SpriteSheet, image: PNG, colorQuantizer?: ColorQuantizer): ImageData => {
    const pngData = new ByteBuffer(image.data);
    const { maxWidth, maxHeight, maxArea, palette } = spriteSheet;
    let minX = -1, minY = -1, maxX = -1, maxY = -1;
    let x = 0, y = 0;
    const pixels: RGBA[][] = new Array(maxHeight);
    let hasAlpha: boolean = false;

    for(let i = 0; i < maxArea; i++) {
        let rgb = pngData.get('int24', 'u');
        let alpha = pngData.get('byte', 'u');

        if(x === 0) {
            pixels[y] = new Array(maxWidth);
        }

        if(rgb === 1) {
            // rgb = 0;
            alpha = 255;
        }

        const color = new RGBA(rgb, alpha);
        pixels[y][x] = color;

        colorQuantizer?.addColor(color);

        const paletteMapIdx = palette.findIndex(c => c.equals(color));
        if(paletteMapIdx === -1) {
            palette.push(color);
        }

        if(!color.isTransparent) {
            if(!hasAlpha && alpha !== 255) {
                hasAlpha = true;
            }

            if(minX === -1 || x < minX) {
                minX = x;
            }
            if(minY === -1 || y < minY) {
                minY = y;
            }
            if(x > maxX) {
                maxX = x;
            }
            if(y > maxY) {
                maxY = y;
            }
        }

        x++;
        if(x >= maxWidth) {
            x = 0;
            y++;
        }
    }

    return { minX, maxX, minY, maxY, pixels, hasAlpha };
};


export const encodeSpriteSheet = (fileIndex: number, fileName: string, images: PNG[], options?: SpriteCodecOptions): void => {
    const spriteSheet = new SpriteSheet(fileIndex, fileName, images);
    const imageData: ImageData[] = new Array(spriteSheet.sprites.length);
    const histogram: { [key: number]: number } = {};
    const { maxHeight, maxWidth, maxArea, palette: spriteSheetPalette } = spriteSheet;
    const rowRanges: RgbRange[] = [];
    const columnRanges: RgbRange[] = [];
    const rowAlphaRanges: AlphaRange[] = [];
    const columnAlphaRanges: AlphaRange[] = [];

    // const depth = 3;
    // const colorQuantizer: ColorQuantizer = new ColorQuantizer(spriteSheet, depth);

    for(let imageIdx = 0; imageIdx < images.length; imageIdx++) {
        const image = images[imageIdx];

        imageData[imageIdx] = readImageData(spriteSheet, image/*, colorQuantizer*/);
        const { pixels } = imageData[imageIdx];

        // row-major duplicate pixel range detection & histogram generation
        for(let y = 0; y < maxHeight; y++) {
            for(let x = 0; x < maxWidth; x++) {
                const rgb = pixels[y][x];

                if(!histogram[rgb.argb]) {
                    histogram[rgb.argb] = 1;
                } else {
                    histogram[rgb.argb] += 1;
                }

                addPixelRangeData(rgb, rowRanges, rowAlphaRanges);
            }
        }

        // column-major duplicate pixel range detection
        for(let x = 0; x < maxWidth; x++) {
            for(let y = 0; y < maxHeight; y++) {
                const rgb = pixels[y][x];
                addPixelRangeData(rgb, columnRanges, columnAlphaRanges);
            }
        }
    }

    // colorQuantizer.addSpriteSheetColors();
    // const palette = colorQuantizer.generateColorPalette(histogram);

    // if(options?.debug) {
    //     dumpOctreeData(colorQuantizer);
    // }

    const palette = sortPalette(spriteSheetPalette);

    // const palette = sortPalette(spriteSheetPalette);

    // palette.unshift(0);

    /*
    const rowFrequencies: ColorFrequency[] = [];
    const columnFrequencies: ColorFrequency[] = [];
    const rowQueue: ColorFrequency[] = [];
    const columnQueue: ColorFrequency[] = [];

    for(const color of spriteSheetColors) {
        if(histogram[color] === 0) {
            continue;
        }

        const frequency = histogram[color] ?? 0;// / maxArea;

        rowFrequencies.push({
            color, frequency,
            left: null,
            right: null,
            code: ''
        });

        columnFrequencies.push({
            color, frequency,
            left: null,
            right: null,
            code: ''
        });
    }

    const rowUsageMap = mapColorUsage(rowRanges);
    const columnUsageMap = mapColorUsage(columnRanges);

    rowFrequencies.sort((a, b) => frequencySort(a, b, rowUsageMap));
    columnFrequencies.sort((a, b) => frequencySort(a, b, columnUsageMap));

    rowFrequencies.forEach(f => rowQueue.push(f));
    columnFrequencies.forEach(f => columnQueue.push(f));

    const rowPalette = generateHuffmanTree(rowQueue, rowFrequencies, rowUsageMap, usesBlack).colorPalette;
    const columnPalette = generateHuffmanTree(columnQueue, columnFrequencies, columnUsageMap, usesBlack).colorPalette;*/



    for(let imageIdx = 0; imageIdx < images.length; imageIdx++) {
        const { pixels } = imageData[imageIdx];

        const rowIndexedPixels: number[] = new Array(maxArea);
        const columnIndexedPixels: number[] = new Array(maxArea);

        let pixelIdx = 0;
        let previousPaletteIdx = 0;
        let columnDiff: number = 0;
        let rowDiff: number = 0;

        // Build the array of palette indices for row-major order
        for(let y = 0; y < maxHeight; y++) {
            for(let x = 0; x < maxWidth; x++) {
                const rgb = pixels[y][x];
                let paletteIdx = palette.findIndex(c => c.equals(rgb));
                if(paletteIdx < 0) {
                    paletteIdx = 0;
                }
                rowIndexedPixels[pixelIdx++] = paletteIdx;
                rowDiff = paletteIdx - previousPaletteIdx;
                previousPaletteIdx = paletteIdx;
            }
        }

        previousPaletteIdx = 0;

        // Build the array of palette indices for column-major order
        for(let x = 0; x < maxWidth; x++) {
            for(let y = 0; y < maxHeight; y++) {
                const rgb = pixels[y][x];
                let paletteIdx = palette.findIndex(c => c.equals(rgb));
                if(paletteIdx < 0) {
                    paletteIdx = 0;
                }
                columnIndexedPixels[maxWidth * y + x] = paletteIdx;
                columnDiff = paletteIdx - previousPaletteIdx;
                previousPaletteIdx = paletteIdx;
            }
        }

        /*let averageRowBits = 0;
        for(let i = 0; i < rowFrequencies.length; i++) {
            const { frequency, code } = rowFrequencies[i];
            if(code === '-') {
                continue;
            }

            averageRowBits += frequency + code.length;
        }

        let averageColumnBits = 0;
        for(let i = 0; i < columnFrequencies.length; i++) {
            const { frequency, code } = columnFrequencies[i];
            if(code === '-') {
                continue;
            }

            averageColumnBits += frequency + code.length;
        }*/

        if(options?.debug) {
            if(options?.forceStorageMethod === 'row-major') {
                // console.log(...rowFrequencies.map(f => f.frequency));
                printSpritePaletteIndices('row-major', maxWidth, maxHeight, rowIndexedPixels, palette);
            } else if(options?.forceStorageMethod === 'column-major') {
                // console.log(...columnFrequencies.map(f => f.frequency));
                printSpritePaletteIndices('column-major', maxWidth, maxHeight, columnIndexedPixels, palette);
            }

            // console.log(`Average Bits:  Column: ${averageColumnBits}  Row: ${averageRowBits}`);

            console.log(`Diffs:         Column: ${columnDiff}  \tRow: ${rowDiff}`);
        }
    }
};
