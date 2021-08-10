import { PNG } from 'pngjs';
import { SpriteSheet } from './sprite-sheet';
import { ByteBuffer } from '@runejs/core/buffer';
import { HSB, HSL, RGB } from '../../util/colors';
import { debugSpritePaletteIndices, printSpritePaletteIndices } from './sprite-debug';


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
    pixels: number[][];
    intensities: number[][];
    alphas: number[][];
    hasAlpha: boolean;
    width?: number;
    height?: number;
}

export interface ColorFrequency {
    nodeIndex: number;
    intensity?: number;
    color?: number;
    frequency: number;
    leftNodeIndex: number;
    rightNodeIndex: number;
    left: ColorFrequency;
    right: ColorFrequency;
    code: string;
}


const generateHuffCode = (root: ColorFrequency, s: string, values: number[]): void => {
    if(!root.left && !root.right) {
        root.code = s;
        values.push(root.color);
    } else {
        generateHuffCode(root.left, `${s}0`, values);
        generateHuffCode(root.right, `${s}1`, values);
    }
};

const sortQueue = (nodeQueue: ColorFrequency[], usageMap: ColorUsageMap) =>
    nodeQueue.sort((colorA: ColorFrequency, colorB: ColorFrequency): number => {
    const rangesA = usageMap[colorA.color];
    const rangesB = usageMap[colorB.color];
    if(!rangesA || !rangesB) {
        return 0;
    }

    if(colorA.color === 1) {
        return -1;
    } else if(colorB.color === 1) {
        return 1;
    }

    const rgbA = new RGB(colorA.color);
    const rgbB = new RGB(colorB.color);

    if(rgbA.intensity > rgbB.intensity) {
        return 1;
    } else if(rgbA.intensity < rgbB.intensity) {
        return -1;
    }

    if(rangesA.rangeCount > rangesB.rangeCount) {
        return 1;
    } else if(rangesA.rangeCount < rangesB.rangeCount) {
        return -1;
    }

    if(colorA.frequency > colorB.frequency) {
        return -1;
    } else if(colorA.frequency < colorB.frequency) {
        return 1;
    }

    return 0;
});


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

const addPixelRangeData = (rgb: number, alpha: number, rgbRanges: RgbRange[], alphaRanges: AlphaRange[]): void => {
    if(!rgbRanges?.length) {
        rgbRanges.push({ rgb, count: 1 });
        alphaRanges.push({ alpha, count: 1 });
    } else {
        const lastEntry = rgbRanges[rgbRanges.length - 1];
        if(lastEntry && lastEntry.rgb === rgb) {
            lastEntry.count++;
        } else {
            rgbRanges.push({ rgb, count: 1 });
        }

        const lastAlphaEntry = alphaRanges[alphaRanges.length - 1];
        if(lastAlphaEntry && lastAlphaEntry.alpha === alpha) {
            lastAlphaEntry.count++;
        } else {
            alphaRanges.push({ alpha, count: 1 });
        }
    }
};


const generateHuffmanTree = (nodeQueue: ColorFrequency[],
                             frequencies: ColorFrequency[],
                             lastIdx: number,
                             usageMap: ColorUsageMap): { rootNode: ColorFrequency, colorPalette: number[] } => {
    sortQueue(nodeQueue, usageMap);

    let root: ColorFrequency = null;

    let nodeIndex: number = lastIdx;

    while(nodeQueue.length > 1) {
        const left = nodeQueue.shift();
        const right = nodeQueue.shift();
        const leftNodeIndex = left.nodeIndex;
        const rightNodeIndex = right.nodeIndex;

        const frequency = right.frequency + left.frequency;
        const color = right.color + left.color;

        root = frequencies[nodeIndex] = {
            color,
            frequency,
            nodeIndex,
            leftNodeIndex, left,
            rightNodeIndex, right,
            code: '-'
        };

        addToQueue(nodeQueue, frequencies[nodeIndex], usageMap);
        nodeIndex++;
    }

    const sortedRowPalette: number[] = [];
    generateHuffCode(root, '', sortedRowPalette);

    /*const blackColorIdx = sortedRowPalette.indexOf(1);
    if(blackColorIdx > 0) {
        // Shift black back to the start of the color palette if it ended up out of order
        sortedRowPalette.splice(sortedRowPalette.indexOf(1), 1);
        sortedRowPalette.unshift(1);
    }*/
    sortedRowPalette.unshift(1);
    sortedRowPalette.unshift(0);

    return { rootNode: root, colorPalette: sortedRowPalette };
};



const readImageData = (spriteSheet: SpriteSheet, image: PNG): ImageData => {
    const pngData = new ByteBuffer(image.data);
    const { maxWidth, maxHeight, maxArea, palette } = spriteSheet;
    let minX = -1, minY = -1, maxX = -1, maxY = -1;
    let x = 0, y = 0;
    const pixels: number[][] = new Array(maxHeight);
    const intensities: number[][] = new Array(maxHeight);
    const alphas: number[][] = new Array(maxHeight);
    let hasAlpha: boolean = false;

    for(let i = 0; i < maxArea; i++) {
        let rgb = pngData.get('int24', 'u');
        let alpha = pngData.get('byte', 'u');

        if(x === 0) {
            pixels[y] = new Array(maxWidth);
            intensities[y] = new Array(maxWidth);
            alphas[y] = new Array(maxWidth);
        }

        if(rgb === 0 || alpha === 0) {
            rgb = alpha === 0 ? 0 : 1;
        }

        const paletteMapIdx = palette.indexOf(rgb);
        if(paletteMapIdx === -1) {
            palette.push(rgb);
        }

        pixels[y][x] = rgb;
        intensities[y][x] = rgb === 1 ? 1 : new RGB(rgb).intensity;
        alphas[y][x] = alpha;

        if(!hasAlpha && alpha !== 255) {
            hasAlpha = true;
        }

        if(rgb !== 0) {
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

    return { minX, maxX, minY, maxY, pixels, intensities, alphas, hasAlpha };
};


export const encodeSpriteSheet = (fileIndex: number, fileName: string, images: PNG[]): void => {
    const spriteSheet = new SpriteSheet(fileIndex, fileName, images);
    const imageData: ImageData[] = new Array(spriteSheet.sprites.length);
    const histogram: { [key: number]: number } = {};
    const { maxHeight, maxWidth, maxArea } = spriteSheet;

    const rowRanges: RgbRange[] = [];
    const columnRanges: RgbRange[] = [];

    const rowAlphaRanges: AlphaRange[] = [];
    const columnAlphaRanges: AlphaRange[] = [];

    let usesBlack: boolean = false;

    for(let imageIdx = 0; imageIdx < images.length; imageIdx++) {
        const image = images[imageIdx];

        imageData[imageIdx] = readImageData(spriteSheet, image);
        const { pixels, alphas } = imageData[imageIdx];

        // row-major duplicate pixel range detection & histogram generation
        for(let y = 0; y < maxHeight; y++) {
            for(let x = 0; x < maxWidth; x++) {
                const rgb = pixels[y][x];

                if(rgb === 0) {
                    continue;
                }
                if(rgb === 1) {
                    usesBlack = true;
                    continue;
                }

                if(!histogram[rgb]) {
                    histogram[rgb] = 1;
                } else {
                    histogram[rgb] += 1;
                }

                addPixelRangeData(rgb, alphas[y][x], rowRanges, rowAlphaRanges);
            }
        }

        // column-major duplicate pixel range detection
        for(let x = 0; x < maxWidth; x++) {
            for(let y = 0; y < maxHeight; y++) {
                const rgb = pixels[y][x];

                if(rgb === 0 || rgb === 1) {
                    continue;
                }

                addPixelRangeData(rgb, alphas[y][x], columnRanges, columnAlphaRanges);
            }
        }
    }

    const spriteSheetColors = Object.keys(histogram).map(n => Number(n));
    let nodes: number = 0;

    for(const color of spriteSheetColors) {
        if(histogram[color] !== 0) {
            nodes++;
        }
    }

    const totalNodes = 2 * nodes - 1;
    const rowFrequencies: ColorFrequency[] = new Array(totalNodes);
    const columnFrequencies: ColorFrequency[] = new Array(totalNodes);
    const rowQueue: ColorFrequency[] = [];
    const columnQueue: ColorFrequency[] = [];

    let nodeIndex = 0;

    for(const color of spriteSheetColors) {
        if(histogram[color] === 0) {
            continue;
        }

        const frequency = histogram[color] / maxArea;

        rowFrequencies[nodeIndex] = {
            color, frequency, nodeIndex,
            leftNodeIndex: -1, left: null,
            rightNodeIndex: -1, right: null,
            code: ''
        };

        columnFrequencies[nodeIndex] = {
            color, frequency, nodeIndex,
            leftNodeIndex: -1, left: null,
            rightNodeIndex: -1, right: null,
            code: ''
        };

        rowQueue.push(rowFrequencies[nodeIndex]);
        columnQueue.push(columnFrequencies[nodeIndex]);
        nodeIndex++;
    }

    const rowUsageMap = mapColorUsage(rowRanges);
    const columnUsageMap = mapColorUsage(columnRanges);

    const rowPalette = generateHuffmanTree(rowQueue, rowFrequencies, nodeIndex, rowUsageMap).colorPalette;
    const columnPalette = generateHuffmanTree(columnQueue, columnFrequencies, nodeIndex, columnUsageMap).colorPalette;

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
                let paletteIdx = rowPalette.indexOf(rgb);
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
                let paletteIdx = columnPalette.indexOf(rgb);
                if(paletteIdx < 0) {
                    paletteIdx = 0;
                }
                columnIndexedPixels[maxWidth * y + x] = paletteIdx;
                columnDiff = paletteIdx - previousPaletteIdx;
                previousPaletteIdx = paletteIdx;
            }
        }

        let averageRowBits = 0;
        for(let i = 0; i < rowFrequencies.length; i++) {
            averageRowBits += rowFrequencies[i].frequency + rowFrequencies[i].code.length;
        }

        let averageColumnBits = 0;
        for(let i = 0; i < columnFrequencies.length; i++) {
            averageColumnBits += columnFrequencies[i].frequency + columnFrequencies[i].code.length;
        }

        printSpritePaletteIndices('row-major', maxWidth, maxHeight, rowIndexedPixels, rowPalette);
        printSpritePaletteIndices('column-major', maxWidth, maxHeight, columnIndexedPixels, columnPalette);
        console.log(`Average Bits:  Column: ${averageColumnBits}  Row: ${averageRowBits}`);
        console.log(`Diffs:         Column: ${columnDiff}  Row: ${rowDiff}`);
    }
};
