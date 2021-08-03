import { ByteBuffer } from '@runejs/core/buffer';
import FileCodec from '../file-codec';
import { PNG } from 'pngjs';
import { logger } from '@runejs/core';
import { HSB, RGB, RGBA } from '../../util/colors';

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

function similarHue(hue1, hue2, interval = 30): boolean {
    return (Math.floor(hue1 / interval) === Math.floor(hue2 / interval));
}

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

    public sprites: Sprite[];
    public maxWidth: number;
    public maxHeight: number;
    public palette: number[];

    public constructor(fileIndex: number,
                       spriteCount: number) {
        this.fileIndex = fileIndex;
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
    public paletteIndices: number[];
    public settings: number;

    public constructor(spriteIndex: number,
                       spriteSheet: SpriteSheet) {
        this.spriteIndex = spriteIndex;
        this.spriteSheet = spriteSheet;
    }

    public getAlpha(pixelIndex: number): number {
        if(this.hasAlpha) {
            return this.pixels[pixelIndex] >> 24;
        }

        return this.paletteIndices[pixelIndex] !== 0 ? 0xff : 0
    }

    public get storageMethod(): SpriteStorageMethod {
        return (this.settings & 0b01) === 0 ? 'row-major' : 'column-major';
    }

    public get hasAlpha(): boolean {
        return (this.settings & 0b10) !== 0;
    }

}


function decodeSprite(fileBuffer: ByteBuffer, sprite: Sprite): PNG {
    const { width, height, offsetX, offsetY } = sprite;
    const { maxWidth, maxHeight } = sprite.spriteSheet;
    const spriteArea: number = width * height;

    sprite.settings = fileBuffer.get('byte', 'unsigned');
    sprite.pixels = new Array(spriteArea);
    sprite.paletteIndices = new Array(spriteArea);

    if(sprite.storageMethod === 'row-major') {
        // row-major (horizontal)

        for(let i = 0; i < spriteArea; i++) {
            const paletteIndex = sprite.paletteIndices[i] = fileBuffer.get('byte');
            sprite.pixels[i] = sprite.spriteSheet.palette[paletteIndex];
        }

        if(sprite.hasAlpha) {
            for(let i = 0; i < spriteArea; i++) {
                sprite.pixels[i] = sprite.pixels[i] | (fileBuffer.get('byte') << 24);
            }
        }
    } else {
        // column-major (vertical)

        for(let x = 0; x < width; x++) {
            for(let y = 0; y < height; y++) {
                const paletteIndex = sprite.paletteIndices[width * y + x] = fileBuffer.get('byte');
                sprite.pixels[width * y + x] = sprite.spriteSheet.palette[paletteIndex];
            }
        }

        if(sprite.hasAlpha) {
            for(let x = 0; x < width; x++) {
                for(let y = 0; y < height; y++) {
                    sprite.pixels[width * y + x] = sprite.pixels[width * y + x] | (fileBuffer.get('byte') << 24);
                }
            }
        }
    }

    if(width === 0 || height === 0) {
        return null;
    }

    const pngData = new ByteBuffer((maxWidth * maxHeight) * 4);

    for(let y = 0; y < maxHeight; y++) {
        for(let x = 0; x < maxWidth; x++) {
            const spriteX = x - offsetX;
            const spriteY = y - offsetY;

            if(spriteX < 0 || spriteY < 0 || spriteX >= width || spriteY >= height) {
                pngData.put(0 & 0x00FFFFFF, 'int');
            } else {
                const i = width * spriteY + spriteX;
                const pixel = sprite.pixels[i];
                const rgba = RGBA.fromRgbInt(pixel, sprite.getAlpha(i)).toInt();
                pngData.put(rgba, 'int');
            }
        }
    }

    pngData.flipWriter();

    const png = new PNG({ width: maxWidth, height: maxHeight, filterType: -1 });
    pngData.copy(png.data, 0, 0);

    try {
        return png.pack();
    } catch(error) {
        logger.error(`Error packing PNG sprite:`, error);
        return null;
    }
}


export let codecMode: SpriteStorageMethod;
export let codecTotals = [ 0, 0 ];
export const setCodecMode = (mode: SpriteStorageMethod) => codecMode = mode;


export default {
    archive: 'sprites',
    revision: '414-458',

    decode: (file, buffer: ByteBuffer) => {
        // Reverse the buffer so we can pull the sprite information from the footer
        const reversedBuffer = new ByteBuffer(new ByteBuffer(buffer).reverse());

        // Read the number of sprites in this pack
        const spriteCount = reversedBuffer.get('short', 'unsigned', 'le');

        const spriteSheet = new SpriteSheet(file.fileIndex, spriteCount);

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

            if(spriteSheet.palette[i] === 0) { // does this store the color white as '0'?
                // spriteSheet.palette[i] = 1;
            }
        }

        // Now read the individual sprites from the beginning of the file
        return spriteSheet.sprites.map(sprite => {
            try {
                const decodedSprite = decodeSprite(buffer, sprite);
                if(file.fileIndex === 780 || file.fileIndex === 781) {
                    console.log(`\n${file.fileIndex}`);
                    console.log(...spriteSheet.palette.slice(1));
                    console.log(`\n`);

                    for(let y = 0; y < sprite.height; y++) {
                        let row = ``;
                        for(let x = 0; x < sprite.width; x++) {
                            const i = sprite.width * y + x;
                            row += pad(sprite.paletteIndices[i], 2) + ' ';
                        }
                        console.log(row);
                    }

                    console.log(`\n`);
                }
                return decodedSprite ? PNG.sync.write(decodedSprite) : null;
            } catch(error) {
                if(buffer?.length) {
                    logger.error(`Error decoding sprite:`, error);
                }
                return null;
            }
        }) as Buffer[];
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

        const rowPaletteMap: { [key: number]: { ranges: number, total: number } } = {};
        const columnPaletteMap: { [key: number]: { ranges: number, total: number } } = {};
        let rowPalette: number[] = [];
        let columnPalette: number[] = [];

        const paletteBuilder = (ranges: { rgb: number, pixels: number }[],
                                paletteMap: { [key: number]: { ranges: number, total: number } },
                                palette: number[]): void => {
            ranges.forEach(range => {
                const entry = paletteMap[range.rgb];
                if(!entry) {
                    palette.push(range.rgb);
                    paletteMap[range.rgb] = { ranges: 1, total: range.pixels };
                } else {
                    entry.ranges++;
                    entry.total += range.pixels;
                }
            });

            palette.sort((firstRgb, secondRgb) => {
                // return firstRgb - secondRgb;
                const a = HSB.fromRgbInt(firstRgb);
                const b = HSB.fromRgbInt(secondRgb);

                if(a.hue === b.hue) {
                    console.log('same hue: ' + firstRgb + ' ' + secondRgb);
                }

                return a.hue - b.hue;

                /*if(!similarHue(a.h, b.h, 20)) {
                    if(a.h < b.h) {
                        return -1;
                    }
                    if(a.h > b.h) {
                        return 1;
                    }
                }
                if(a.s < b.s) {
                    return 1;
                }
                if(a.s > b.s) {
                    return -1;
                }
                if(a.v < b.v) {
                    return -1;
                }
                if(a.v > b.v) {
                    return 1;
                }
                return 0;*/

                /*if(hsb1[0] === hsb2[0]) {
                    if(hsb1[1] === hsb2[1]) {
                        return hsb2[2] - hsb1[2];
                    } else {
                        return hsb1[1] - hsb2[1];
                    }
                }

                return hsb1[0] - hsb2[0];*/
            });//.reverse();
        };

        // Count the number of ranges that each color appears in for row-major order
        paletteBuilder(rowRanges, rowPaletteMap, rowPalette);

        // Count the number of ranges that each color appears in for column-major order
        paletteBuilder(columnRanges, columnPaletteMap, columnPalette);

        /*rowPalette = rowPalette.sort((a, b) => {
            const [ aH, aS, aL ] = argbToHsvValues(a);
            const [ bH, bS, bL ] = argbToHsvValues(b);

            if(aL === bL) {
                return aH !== bH ? bH - aH : bS - aS;
            }

            return bL - aL;
        });

        columnPalette = columnPalette.sort((a, b) => {
            const [ aH, aS, aL ] = argbToHsvValues(a);
            const [ bH, bS, bL ] = argbToHsvValues(b);

            if(aL === bL) {
                return aH !== bH ? aH - bH : aS - bS;
            }

            return aL - bL;
        });*/
        if(rowPalette.indexOf(1) !== -1) {
            rowPalette.splice(rowPalette.indexOf(1), 1);
            rowPalette.unshift(1);
        }
        if(columnPalette.indexOf(1) !== -1) {
            columnPalette.splice(columnPalette.indexOf(1), 1);
            columnPalette.unshift(1);
        }
        if(rowPalette.indexOf(0) !== -1) {
            rowPalette.splice(rowPalette.indexOf(0), 1);
            rowPalette.unshift(0);
        }
        if(columnPalette.indexOf(0) !== -1) {
            columnPalette.splice(columnPalette.indexOf(0), 1);
            columnPalette.unshift(0);
        }


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

        if(!codecMode || (codecMode && codecMode !== storageMethod)) {
            console.error(`\nDetected: ${storageMethod}`);
            console.log(`\nRow:\t ranges:${rowRangeTotal} indicesDiff:${rowDiff} total:${rowGrandTotal}`);
            // console.log(`\nRow:\t`, rowRanges);
            console.log(`\nColumn:\t ranges:${columnRangeTotal} indicesDiff:${columnDiff} total:${columnGrandTotal}`);
            // console.log(`\nColumn:\t`, columnRanges);
            codecTotals[1]++;
        } else {
            codecTotals[0]++;
        }

        if(codecMode === 'row-major') {
            console.log(...rowPalette);
            for(let y = 0; y < height; y++) {
                let row = ``;
                for(let x = 0; x < width; x++) {
                    const i = width * y + x;
                    row += pad(rowPaletteIndices[i], 2) + ' ';
                }
                console.log(row);
            }
        } else {
            console.log(...columnPalette);
            for(let y = 0; y < height; y++) {
                let row = ``;
                for(let x = 0; x < width; x++) {
                    const i = width * y + x;
                    row += pad(columnPaletteIndices[i], 2) + ' ';
                }
                console.log(row);
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
