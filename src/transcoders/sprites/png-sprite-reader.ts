import { RGBA } from '../../util';
import { SpriteSheet, SpriteStorageMethod } from './sprite-sheet';
import { PNG } from 'pngjs';
import { ColorQuantizer } from './color-quantizer';
import { ByteBuffer } from '@runejs/core/buffer';
import { logger } from '@runejs/core';


export interface PngSpriteData {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    pixels: RGBA[][];
    hasAlpha: boolean;
    indexedPixels?: number[];
    alphas?: number[];
    width?: number;
    height?: number;
    storageMethod?: SpriteStorageMethod;
}


export interface ColorRange {
    argb: number;
    count: number;
}

export interface MajorOrderPair<T> {
    row: T;
    col: T;
}


export class PixelHistogram {

    public readonly sprite: PngSpriteData;

    public colorUses: { [key: number]: number };
    public colorRanges: MajorOrderPair<ColorRange[]>;
    public indexRating: MajorOrderPair<number>;
    public pixelIndices: MajorOrderPair<number[]>;

    public constructor(sprite: PngSpriteData) {
        this.sprite = sprite;
    }

    public calculateWeight(type: keyof MajorOrderPair<any>): number {
        const ranges = this.colorRanges[type];
        const indexRating = this.indexRating[type];
        const uses = this.colorUses;
        const colors = Object.keys(uses).map(n => Number(n));
        const colorWeights: { [key: number]: number } = {};
        let pixelWeight = 0;

        for(const argb of colors) {
            const rangeData = ranges.find(c => c.argb === argb);
            if(!rangeData) {
                continue;
            }

            colorWeights[argb] = rangeData.count + uses[argb];
            pixelWeight += colorWeights[argb];
        }

        return pixelWeight + indexRating;
    }

    public buildHistogram(palette: RGBA[]): void {
        const { pixels, width, height, minX, minY } = this.sprite;
        const ranges = this.colorRanges = { row: [], col: [] };
        const uses = this.colorUses = {};
        const diffs = this.indexRating = { row: 0, col: 0 };
        let previousPaletteIndex = 0;
        let i = 0;

        // row-major
        for(let y = 0; y < height; y++) {
            for(let x = 0; x < width; x++) {
                const color = pixels[y + minY][x + minX];
                const argb = color.argb;
                if(!uses[argb]) {
                    uses[argb] = 1;
                } else {
                    uses[argb]++;
                }

                const paletteIndex = this.pixelIndices.row[i++] = this.readPixel(color, ranges.row, palette);
                if(paletteIndex !== 0) {
                    diffs.row += Math.abs(paletteIndex - previousPaletteIndex);
                    previousPaletteIndex = paletteIndex;
                }
            }
        }

        i = 0;

        // column-major
        for(let x = 0; x < width; x++) {
            for(let y = 0; y < height; y++) {
                const paletteIndex = this.pixelIndices.col[i++] = this.readPixel(pixels[y + minY][x + minX], ranges.col, palette);
                if(paletteIndex !== 0) {
                    diffs.row += Math.abs(paletteIndex - previousPaletteIndex);
                    previousPaletteIndex = paletteIndex;
                }
            }
        }
    }

    public readPixel(color: RGBA, ranges: ColorRange[], palette: RGBA[]): number {
        const paletteIndex = palette.findIndex(c => c.equals(color));
        if(paletteIndex <= 0) {
            return 0;
        }

        const argb = color.argb;
        const lastEntry = ranges?.length ? ranges[ranges.length - 1] : null;

        if(lastEntry && lastEntry.argb === argb) {
            lastEntry.count++;
        } else {
            ranges.push({ argb, count: 1 });
        }

        return paletteIndex;
    }

}


export class PngSpriteReader {

    public readonly spriteSheet: SpriteSheet;
    public readonly sprites: PNG[]
    public readonly spriteData: PngSpriteData[];

    public constructor(spriteSheet: SpriteSheet, sprites: PNG[]) {
        this.spriteSheet = spriteSheet;
        this.sprites = sprites;
        this.spriteData = new Array(sprites.length).fill(null);
    }

    public readSprite(spriteIndex: number): PngSpriteData {
        const image = this.sprites[spriteIndex];
        if(!image) {
            throw new Error(`Sprite at index ${spriteIndex} was not found.`);
        }

        const pngData = new ByteBuffer(image.data);
        const { maxWidth, maxHeight, maxArea, palette } = this.spriteSheet;
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

            if(!color.isTransparent) {
                // colorQuantizer?.addColor(color);

                const paletteMapIdx = palette.findIndex(c => c.equals(color));
                if(paletteMapIdx === -1) {
                    palette.push(color);
                }

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

        if(minX < 0) {
            minX = 0;
        }
        if(minY < 0) {
            minY = 0;
        }

        const width = maxX - minX + 1;
        const height = maxY - minY + 1;

        this.spriteData[spriteIndex] = { minX, maxX, minY, maxY, width, height, pixels, hasAlpha };
        return this.spriteData[spriteIndex];
    }

}
