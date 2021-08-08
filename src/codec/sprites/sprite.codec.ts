import { ByteBuffer } from '@runejs/core/buffer';
import FileCodec from '../file-codec';
import { PNG } from 'pngjs';
import { logger } from '@runejs/core';
import { HSB, paletteBuilder, RGB, RGBA } from '../../util/colors';
import { dumpSpriteSheetData, printSpritePaletteIndices, SpriteDebugSettings } from './sprite-debug';




let spriteCodecMode: 'debug' | 'standard' = 'standard';

export const spriteCodecDebugSettings: SpriteDebugSettings = {};

export const setSpriteCodecMode = (mode: 'debug' | 'standard', settings?: SpriteDebugSettings) => {
    spriteCodecMode = mode;

    if(settings?.expectedStorageMode) {
        spriteCodecDebugSettings.expectedStorageMode = settings.expectedStorageMode;
    }
    if(settings?.expectedTotals) {
        spriteCodecDebugSettings.expectedTotals = settings.expectedTotals;
    }
};


/**
 * The method with which pixel data is stored for a single Sprite within a SpriteSheet.
 *
 * `'row-major'`: Pixel data is stored "horizontally", with values moving along the x-axis before
 * running out of space and moving down to the next y-axis "row" within the array.
 *
 * `'column-major'`: Pixel data is stored "vertically", with values moving downwards along the y-axis "rows"
 * within the array, before moving onto the next x-axis "column" when the last y value is reached.
 *
 * @see https://en.wikipedia.org/wiki/Row-_and_column-major_order
 */
export type SpriteStorageMethod = 'row-major' | 'column-major';


export class SpriteSheet {

    public readonly fileIndex: number;
    public readonly fileName: string;

    public sprites: Sprite[];
    public maxWidth: number;
    public maxHeight: number;
    public palette: number[];

    public constructor(fileIndex: number,
                       fileName: string,
                       spriteCount: number) {
        this.fileIndex = fileIndex;
        this.fileName = fileName;
        this.sprites = new Array(spriteCount);
    }

}


export class Sprite {

    public readonly spriteIndex: number;
    public readonly spriteSheet: SpriteSheet;

    public width: number;
    public height: number;
    public offsetX: number;
    public offsetY: number;
    public pixels: number[];
    public alphas: number[];
    public paletteIndices: number[];
    public settings: number;
    public png: PNG | undefined;

    public constructor(spriteIndex: number,
                       spriteSheet: SpriteSheet) {
        this.spriteIndex = spriteIndex;
        this.spriteSheet = spriteSheet;
    }

    public decompress(fileBuffer: ByteBuffer): PNG {
        this.settings = fileBuffer.get('byte', 'unsigned');

        const {
            width, height, offsetX, offsetY,
            storageMethod, minArea, maxArea, hasAlpha,
            spriteSheet, spriteSheet: { maxWidth, maxHeight }
        } = this;

        this.pixels = new Array(minArea);
        this.alphas = new Array(minArea);
        this.paletteIndices = new Array(minArea);

        if(storageMethod === 'row-major') {
            // row-major pixel ordering [y][x] (horizontal)
            // each 'x' value is read in the first 'y' column before moving to the next 'y' column
            for(let i = 0; i < minArea; i++) {
                const paletteIndex = this.paletteIndices[i] = fileBuffer.get('byte');
                this.pixels[i] = spriteSheet.palette[paletteIndex];
            }

            if(hasAlpha) {
                for(let i = 0; i < minArea; i++) {
                    this.alphas[i] = fileBuffer.get('byte');
                }
            }
        } else {
            // column-major pixel ordering [x][y] (vertical)
            // each 'y' value is read in the first 'x' row before moving to the next 'x' row
            for(let x = 0; x < width; x++) {
                for(let y = 0; y < height; y++) {
                    const paletteIndex = this.paletteIndices[width * y + x] = fileBuffer.get('byte');
                    this.pixels[width * y + x] = spriteSheet.palette[paletteIndex];
                }
            }

            if(hasAlpha) {
                for(let x = 0; x < width; x++) {
                    for(let y = 0; y < height; y++) {
                        this.alphas[width * y + x] = fileBuffer.get('byte');
                    }
                }
            }
        }

        // No image data found
        if(width === 0 || height === 0) {
            return null;
        }

        const png = new PNG({
            width: maxWidth,
            height: maxHeight,
            colorType: 6,
            inputHasAlpha: true,
            filterType: -1
        });
        const pngData = new ByteBuffer(maxArea * 4);

        for(let y = 0; y < maxHeight; y++) {
            for(let x = 0; x < maxWidth; x++) {
                const spriteX = x - offsetX;
                const spriteY = y - offsetY;

                if(spriteX < 0 || spriteY < 0 || spriteX >= width || spriteY >= height) {
                    pngData.put(0 & 0x00FFFFFF, 'int');
                } else {
                    const i = width * spriteY + spriteX;
                    pngData.put(RGBA.fromRgbInt(this.pixels[i], this.getAlpha(i)).toInt(), 'int');
                }
            }
        }

        // Copy the data from the RuneBuffer to the PNG data buffer
        png.data = Buffer.from(pngData.flipWriter());

        try {
            return png.pack();
        } catch(error) {
            logger.error(`Error packing PNG sprite:`, error);
            return null;
        }
    }

    public getAlpha(pixelIndex: number): number {
        if(pixelIndex < 0 || this.alphas.length <= pixelIndex) {
            return 0;
        }

        if(this.hasAlpha) {
            return this.alphas[pixelIndex];
        }

        return this.paletteIndices[pixelIndex] !== 0 ? 0xff : 0;
    }

    public get storageMethod(): SpriteStorageMethod {
        return (this.settings & 0b01) === 0 ? 'row-major' : 'column-major';
    }

    public get hasAlpha(): boolean {
        return (this.settings & 0b10) !== 0;
    }

    public get minArea(): number {
        return (this.width ?? 0) * (this.height ?? 0);
    }

    public get maxArea(): number {
        return (this.spriteSheet?.maxWidth ?? 0) * (this.spriteSheet?.maxHeight ?? 0);
    }

}


export default {
    archive: 'sprites',
    revision: '414-458',

    decode: (file, buffer: ByteBuffer) => {
        // Reverse the buffer so we can pull the sprite information from the footer
        const reversedBuffer = new ByteBuffer(new ByteBuffer(buffer).reverse());

        // Read the number of sprites in this pack
        const spriteCount = reversedBuffer.get('short', 'unsigned', 'le');

        const spriteSheet = new SpriteSheet(file.fileIndex, file.fileName, spriteCount);

        // Individual sprite metadata - height, width, offsetY, offsetX
        for(let i = spriteCount - 1; i >= 0; i--) {
            spriteSheet.sprites[i] = new Sprite(i, spriteSheet);
            spriteSheet.sprites[i].height = reversedBuffer.get('short', 'unsigned', 'le');
        }
        for(let i = spriteCount - 1; i >= 0; i--) {
            spriteSheet.sprites[i].width = reversedBuffer.get('short', 'unsigned', 'le');
        }
        for(let i = spriteCount - 1; i >= 0; i--) {
            spriteSheet.sprites[i].offsetY = reversedBuffer.get('short', 'unsigned', 'le');
        }
        for(let i = spriteCount - 1; i >= 0; i--) {
            spriteSheet.sprites[i].offsetX = reversedBuffer.get('short', 'unsigned', 'le');
        }

        // Sprite pack color count and max height + width
        const paletteLength = reversedBuffer.get('byte', 'unsigned');
        spriteSheet.maxHeight = reversedBuffer.get('short', 'unsigned', 'le');
        spriteSheet.maxWidth = reversedBuffer.get('short', 'unsigned', 'le');

        spriteSheet.palette = new Array(paletteLength + 1).fill(0);

        // Parse all of the colors used in the pack
        for(let i = paletteLength; i > 0; i--) {
            spriteSheet.palette[i] = reversedBuffer.get('int24', 'signed', 'le');

            // converts the color 0 (black) into the int 1 to differentiate between black and transparent (0 is used for fully transparent pixels)
            if(spriteSheet.palette[i] === 0) {
                spriteSheet.palette[i] = 1;
            }
        }

        // Now read the individual sprites from the beginning of the file
        const spriteBuffers = spriteSheet.sprites.map(sprite => {
            try {
                const decodedSprite: PNG = sprite.decompress(buffer);
                return decodedSprite ? PNG.sync.write(decodedSprite) : null;
            } catch(error) {
                if(buffer?.length) {
                    logger.error(`Error decoding sprite:`, error);
                }
                return null;
            }
        }) as Buffer[];

        if(spriteCodecMode === 'debug') {
            dumpSpriteSheetData(spriteSheet);
        }

        return spriteBuffers;
    },

    encode: (file, data: Buffer | Buffer[]) => {
        if(!data?.length || !data[0]) {
            return null;
        }

        let images: PNG[];

        if(data[0] instanceof Buffer) {
            images = (data as Buffer[]).map((b, i) => {
                try {
                    return PNG.sync.read(b);
                } catch(error) {
                    logger.error(`Error encoding sprite[${i}]:`, file, error);
                    return null;
                }
            })?.filter(png => png?.data?.length ?? 0 > 0);
        } else {
            try {
                images = [ PNG.sync.read(data as Buffer) ];
            } catch(error) {
                logger.error(`Error encoding sprite:`, file, error);
                return null;
            }
        }

        if(!images?.length) {
            logger.error(`Unable to encode sprite file.`);
            return null;
        }

        const palette: number[] = [];

        const spriteCount = images.length;
        const maxWidth = images[0].width;
        const maxHeight = images[0].height;
        const maxArea = maxWidth * maxHeight;

        const sprite = images[0];
        const pngData = new ByteBuffer(sprite.data);
        let minX = -1, minY = -1, maxX = -1, maxY = -1;
        let ix = 0, iy = 0;
        let pixels: number[][] = new Array(maxHeight);
        let alphaValues: number[][] = new Array(maxHeight);
        let hasAlpha: boolean = false;

        for(let i = 0; i < maxArea; i++) {
            let rgb = pngData.get('int24', 'u');
            let alpha = pngData.get('byte', 'u');

            if(ix === 0) {
                pixels[iy] = new Array(maxWidth);
                alphaValues[iy] = new Array(maxWidth);
            }

            if(rgb === 0 || alpha === 0) {
                rgb = alpha === 0 ? 0 : 1;
            }

            const paletteMapIdx = palette.indexOf(rgb);
            if(paletteMapIdx === -1) {
                palette.push(rgb);
            }

            pixels[iy][ix] = rgb;
            alphaValues[iy][ix] = alpha;

            if(!hasAlpha && alpha !== 255) {
                hasAlpha = true;
            }

            if(rgb !== 0) {
                if(minX === -1 || ix < minX) {
                    minX = ix;
                }
                if(minY === -1 || iy < minY) {
                    minY = iy;
                }
                if(ix > maxX) {
                    maxX = ix;
                }
                if(iy > maxY) {
                    maxY = iy;
                }
            }

            ix++;
            if(ix >= maxWidth) {
                ix = 0;
                iy++;
            }
        }

        const width = maxX - minX + 1;
        const height = maxY - minY + 1;
        const actualArea = width * height;
        const offsetX = minX;
        const offsetY = minY;

        const rowRanges: { rgb: number, pixels: number }[] = [];
        const columnRanges: { rgb: number, pixels: number }[] = [];

        const rowAlphaRanges: { alpha: number, count: number }[] = [];
        const columnAlphaRanges: { alpha: number, count: number }[] = [];

        // row-major order
        for(let y = 0; y < height; y++) {
            for(let x = 0; x < width; x++) {
                const rgb = pixels[y + offsetY][x + offsetX];
                const alpha = alphaValues[y + offsetY][x + offsetX];

                if(!rowRanges?.length) {
                    rowRanges.push({ rgb, pixels: 1 });
                    rowAlphaRanges.push({ alpha, count: 1 });
                } else {
                    const lastEntry = rowRanges[rowRanges.length - 1];
                    if(lastEntry && lastEntry.rgb === rgb) {
                        lastEntry.pixels++;
                    } else {
                        rowRanges.push({ rgb, pixels: 1 });
                    }

                    const lastAlphaEntry = rowAlphaRanges[rowAlphaRanges.length - 1];
                    if(lastAlphaEntry && lastAlphaEntry.alpha === alpha) {
                        lastAlphaEntry.count++;
                    } else {
                        rowAlphaRanges.push({ alpha, count: 1 });
                    }
                }
            }
        }

        // column-major order
        for(let x = 0; x < width; x++) {
            for(let y = 0; y < height; y++) {
                const rgb = pixels[y + offsetY][x + offsetX];
                const alpha = alphaValues[y + offsetY][x + offsetX];

                if(!columnRanges?.length) {
                    columnRanges.push({ rgb, pixels: 1 });
                    columnAlphaRanges.push({ alpha, count: 1 });
                } else {
                    const lastEntry = columnRanges[columnRanges.length - 1];
                    if(lastEntry && lastEntry.rgb === rgb) {
                        lastEntry.pixels++;
                    } else {
                        columnRanges.push({ rgb, pixels: 1 });
                    }
                }

                const lastAlphaEntry = columnAlphaRanges[columnAlphaRanges.length - 1];
                if(lastAlphaEntry && lastAlphaEntry.alpha === alpha) {
                    lastAlphaEntry.count++;
                } else {
                    columnAlphaRanges.push({ alpha, count: 1 });
                }
            }
        }

        let rowPalette: number[] = [];
        let columnPalette: number[] = [];

        // Count the number of ranges that each color appears in for row-major order
        paletteBuilder(rowRanges, rowPalette);

        // Count the number of ranges that each color appears in for column-major order
        paletteBuilder(columnRanges, columnPalette);


        const rowRangeCounts: number = rowRanges.length;
        const columnRangeCounts: number = columnRanges.length;

        const rowAlphaRangeCounts: number = hasAlpha ? rowAlphaRanges.length : 0;
        const columnAlphaRangeCounts: number = hasAlpha ? columnAlphaRanges.length : 0;

        const rowRangeTotal = rowRangeCounts + rowAlphaRangeCounts;
        const columnRangeTotal = columnRangeCounts + columnAlphaRangeCounts;

        let columnDiff: number = 0;
        let rowDiff: number = 0;
        let previousPaletteIdx = 0;

        const rowPaletteIndices: number[] = new Array(actualArea);
        const columnPaletteIndices: number[] = new Array(actualArea);

        // Build the array of palette indices for row-major order
        let ri = 0;
        for(let y = 0; y < height; y++) {
            for(let x = 0; x < width; x++) {
                const pixel = pixels[y + offsetY][x + offsetX];
                let paletteIdx = rowPalette.indexOf(pixel);
                if(paletteIdx < 0) {
                    paletteIdx = 0;
                }
                rowPaletteIndices[ri++] = paletteIdx;
                rowDiff = paletteIdx - previousPaletteIdx;
                previousPaletteIdx = paletteIdx;
            }
        }

        previousPaletteIdx = 0;

        // Build the array of palette indices for column-major order
        for(let x = 0; x < width; x++) {
            for(let y = 0; y < height; y++) {
                const pixel = pixels[y + offsetY][x + offsetX];
                let paletteIdx = columnPalette.indexOf(pixel);
                if(paletteIdx < 0) {
                    paletteIdx = 0;
                }
                columnPaletteIndices[width * y + x] = paletteIdx;
                columnDiff = paletteIdx - previousPaletteIdx;
                previousPaletteIdx = paletteIdx;
            }
        }

        rowDiff = Math.abs(rowDiff);
        columnDiff = Math.abs(columnDiff);

        const rowGrandTotal = (rowRangeTotal + rowDiff);
        const columnGrandTotal = (columnRangeTotal + columnDiff);

        const storageMethod: SpriteStorageMethod = rowGrandTotal <= columnGrandTotal ? 'row-major' : 'column-major';

        if(spriteCodecMode === 'debug') {
            const expectedStorageMode = spriteCodecDebugSettings?.expectedStorageMode ?? storageMethod;
            if(expectedStorageMode !== storageMethod) {
                console.error(`\nDetected: ${storageMethod}`);
                console.log(`\nRow:\t ranges:${rowRangeTotal} indicesDiff:${rowDiff} total:${rowGrandTotal}`);
                // console.log(`\nRow:\t`, rowRanges);
                console.log(`\nColumn:\t ranges:${columnRangeTotal} indicesDiff:${columnDiff} total:${columnGrandTotal}`);
                // console.log(`\nColumn:\t`, columnRanges);
                if(spriteCodecDebugSettings.expectedTotals) {
                    spriteCodecDebugSettings.expectedTotals[1]++;
                }
            } else if(spriteCodecDebugSettings.expectedTotals) {
                spriteCodecDebugSettings.expectedTotals[0]++;
            }

            if(expectedStorageMode === 'row-major') {
                printSpritePaletteIndices(storageMethod, rowPalette, width, height, rowPaletteIndices);
            } else {
                printSpritePaletteIndices(storageMethod, columnPalette, width, height, columnPaletteIndices);
            }
        }

        console.log(`\n`);

        /*let pixels: number[][][] = new Array(spriteCount);
        let paletteIndices: number[][][] = new Array(spriteCount);
        let alphaValues: number[][][] = new Array(spriteCount);
        let minX = -1, minY = -1, maxX = -1, maxY = -1;

        for(let spriteIdx = 0; spriteIdx < spriteCount; spriteIdx++) {
            const png = images[spriteIdx];
            const { width: maxWidth, height: maxHeight, data } = png;
            const pngData = new ByteBuffer(data);

            pixels[spriteIdx] = new Array(maxHeight);
            paletteIndices[spriteIdx] = new Array(maxHeight);
            alphaValues[spriteIdx] = new Array(maxHeight);

            minX = -1;
            minY = -1;
            maxX = -1;
            maxY = -1;

            // Read all pixel and color data from the original PNG image file

            let previousIdx = -1;
            let consecutive = 0;
            // PNG image pixels are read in row-major order
            for(let y = 0; y < maxHeight; y++) {
                pixels[spriteIdx][y] = new Array(maxWidth);
                alphaValues[spriteIdx][y] = new Array(maxWidth).fill(0);

                for(let x = 0; x < maxWidth; x++) {
                    const rgb = pngData.get('int24', 'u');
                    const alpha = pngData.get('byte', 'u');
                    // const [ rgb, alpha ] = rgbaToArgb(rgba);

                    if(rgb !== 0 || alpha !== 0) {
                        // console.log(rgb, alpha);

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

                        const paletteMapIdx = paletteMap.findIndex(p => p.color === rgb);
                        if(paletteMapIdx === -1) {
                            paletteMap.push({ color: rgb, weight: 1 });
                        } else {
                            paletteMap[paletteMapIdx].weight++;
                        }

                        if(paletteMapIdx !== -1 && previousIdx === paletteMapIdx) {
                            consecutive++;
                            paletteMap[paletteMapIdx].weight += consecutive;
                        } else {
                            consecutive = 0;
                        }

                        previousIdx = paletteMapIdx;

                        pixels[spriteIdx][y][x] = rgb ?? 0;
                        alphaValues[spriteIdx][y][x] = alpha ?? 255;
                    } else {
                        pixels[spriteIdx][y][x] = 0;
                        alphaValues[spriteIdx][y][x] = 0;
                        consecutive = 0;
                    }
                }
            }
        }

        // Sort the color palette array to make the file compress more efficiently

        const palette = paletteMap
            .sort((a, b) => {
                if(a.color === 1) {
                    return -1;
                } else if(b.color === 1) {
                    return 1;
                }

                return b.weight - a.weight;
            }).map(p => p.color);
        palette.unshift(0);

        for(let spriteIdx = 0; spriteIdx < spriteCount; spriteIdx++) {
            // Now find the color palette index for each individual image pixel within the sorted palette array

            for(let y = 0; y < maxHeight; y++) {
                paletteIndices[spriteIdx][y] = new Array(maxWidth).fill(0);

                for(let x = 0; x < maxWidth; x++) {
                    const pixel = pixels[spriteIdx][y][x] ?? 0;
                    paletteIndices[spriteIdx][y][x] = palette.indexOf(pixel);
                }
            }


            // Determine whether to store the palette indices in row-major or column-major order
            // To figure this out, we loop through each version of the file and diff the sum
            // of each individual column or row. The resulting diffs of each type are then compared
            // and the smallest one is used to store the pixel index data. In the event of a tie,
            // column-major is used by default.

            const actualWidth = maxX - minX;
            const actualHeight = maxY - minY;
            const actualArea = actualWidth * actualHeight;
            const offsetX = minX;
            const offsetY = minY;

            const columnResized: number[] = new Array(actualArea);
            const rowResized: number[] = new Array(actualArea);

            let resizedIdx = 0;
            let columnDiff: number = 0;
            let rowDiff: number = 0;

            let previousDiff = 0;
            for(let x = offsetX; x < actualWidth + offsetX; x++) {
                let previousPaletteIdx = 0;
                let diff = 0;

                for(let y = offsetY; y < actualHeight + offsetY; y++) {
                    const paletteIdx = paletteIndices[spriteIdx][y][x] ?? 0;
                    columnResized[resizedIdx++] = paletteIdx;
                    diff += paletteIdx;
                    previousPaletteIdx = paletteIdx;
                }

                columnDiff += diff - previousDiff;
                previousDiff = diff;
            }

            resizedIdx = 0;
            previousDiff = 0;

            for(let y = offsetY; y < actualHeight + offsetY; y++) {
                let previousPaletteIdx = 0;
                let diff = 0;

                for(let x = offsetX; x < actualWidth + offsetX; x++) {
                    const paletteIdx = paletteIndices[spriteIdx][y][x] ?? 0;
                    rowResized[resizedIdx++] = paletteIdx;
                    diff += paletteIdx;
                    previousPaletteIdx = paletteIdx;
                }

                rowDiff += diff - previousDiff;
                previousDiff = diff;
            }

            rowDiff = Math.abs(rowDiff);
            columnDiff = Math.abs(columnDiff);

            const storageMethod: SpriteStorageMethod = columnDiff < rowDiff ? 'column-major' : 'row-major';

            //if(codecMode && codecMode !== storageMethod) {
                console.log(`File Name:\t${file.fileName}`);
                console.warn(`Detected:\t${storageMethod}`);
                console.log(`Column Diff:\t${columnDiff}`);
                console.log(`Row Diff:\t${rowDiff}`);
                console.log('Palette:\t' + palette.join(' '));
                // console.log('Alphas:\t' + alphaValues.join(' '));
                console.log('\n');
            //}

            // @TODO write footer data
            // @TODO test
        }

        const paletteLength = palette.length;

        const buffer = new ByteBuffer(100000);*/

        return null;
    }
} as FileCodec;
