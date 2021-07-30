import { ByteBuffer } from '@runejs/core/buffer';
import FileCodec from '../file-codec';
import { PNG } from 'pngjs';
import { toRgb } from '../../client-store';
import { logger } from '@runejs/core';
import { argbToRgba, rgbaToArgb } from '../../util/colors';
import { buf } from 'crc-32';


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
                const rgba = argbToRgba(pixel, sprite.getAlpha(i));
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

        spriteSheet.palette = new Array(paletteLength + 1);

        // Parse all of the colors used in the pack
        for(let i = paletteLength; i > 0; i--) {
            spriteSheet.palette[i] = reversedBuffer.get('int24', 'signed', 'le');

            if(spriteSheet.palette[i] === 0) {
                spriteSheet.palette[i] = 1;
            }
        }

        // Now read the individual sprites from the beginning of the file
        return spriteSheet.sprites.map(sprite => {
            try {
                const decodedSprite = decodeSprite(buffer, sprite);
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

        images.forEach(png => {
            const { width: maxWidth, height: maxHeight, data } = png;
            const area = maxHeight * maxWidth;
            const pngData = new ByteBuffer(data);

            const pixels: number[][] = new Array(maxHeight);
            const paletteIndices: number[][] = new Array(maxHeight);
            const alphaValues: number[][] = new Array(maxHeight);
            let minX = -1, minY = -1, maxX = -1, maxY = -1;

            // PNG image pixels are read in row-major order
            for(let y = 0; y < maxHeight; y++) {
                pixels[y] = new Array(maxWidth);
                paletteIndices[y] = new Array(maxWidth);
                alphaValues[y] = new Array(maxWidth);

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

                        if(palette.indexOf(rgb) === -1) {
                            palette.push(rgb);
                        }

                        pixels[y][x] = rgb;
                        alphaValues[y][x] = alpha;
                    }
                }
            }

            palette.sort((a, b) => a - b);

            console.log(palette);

            for(let y = 0; y < maxHeight; y++) {
                for(let x = 0; x < maxWidth; x++) {
                    const pixel = pixels[y][x];
                    if(pixel === undefined) {
                        continue;
                    }

                    const paletteIndex = palette.indexOf(pixel);
                    if(paletteIndex === -1) {
                        continue;
                    }

                    paletteIndices[y][x] = paletteIndex;
                }
            }


            // @TODO determine if image is row-major or column-major
            // Graham: I think I'd encode them both ways, compress both and then see which is smaller
            // ^ It appears they do this and pick the smallest file size in order to save space/bandwidth


            const actualWidth = maxX - minX;
            const actualHeight = maxY - minY;
            const actualArea = actualWidth * actualHeight;
            const offsetX = minX;
            const offsetY = minY;

            const columnMajorResized: number[] = new Array(actualArea);
            const rowMajorResized: number[] = new Array(actualArea);

            let resizedIdx = 0;
            let columnMajorDiff: number = 0;
            let rowMajorDiff: number = 0;

            let previousDiff = 0;
            for(let x = offsetX; x < actualWidth + offsetX; x++) {
                let previousPaletteIdx = 0;
                let diff = 0;

                for(let y = offsetY; y < actualHeight + offsetY; y++) {
                    const paletteIdx = paletteIndices[y][x] ?? 0;
                    diff += paletteIdx;
                    previousPaletteIdx = paletteIdx;
                    columnMajorResized[resizedIdx++] = paletteIdx;
                }

                columnMajorDiff += diff - previousDiff;
                previousDiff = diff;
            }

            resizedIdx = 0;
            previousDiff = 0;

            for(let y = offsetY; y < actualHeight + offsetY; y++) {
                let previousPaletteIdx = 0;
                let diff = 0;

                for(let x = offsetX; x < actualWidth + offsetX; x++) {
                    const paletteIdx = paletteIndices[y][x] ?? 0;
                    diff += paletteIdx;
                    previousPaletteIdx = paletteIdx;
                    rowMajorResized[resizedIdx++] = paletteIdx;
                }

                rowMajorDiff += diff - previousDiff;
                previousDiff = diff;
            }

            const storageMethod: SpriteStorageMethod = rowMajorDiff < columnMajorDiff ? 'row-major' : 'column-major';

            console.log(`column diff:\t` + columnMajorDiff);
            console.log(`row diff:\t` + rowMajorDiff);
            console.log(`\nDetected Method: ${storageMethod}`);
            // console.log(columnMajorResized);
            // console.log(rowMajorResized);

            // @TODO write footer data
            // @TODO test
        });

        const paletteLength = palette.length;

        const buffer = new ByteBuffer(100000);

        return null;
    }
} as FileCodec;
