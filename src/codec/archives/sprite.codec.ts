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

        images.forEach(png => {
            const { width: maxWidth, height: maxHeight, data } = png;
            const area = maxHeight * maxWidth;
            const buffer = new ByteBuffer(data);

            const paletteIndices: number[] = new Array(area);
            const alphaValues: number[] = new Array(area);

            let x = 0;
            let y = 0;
            let offsetX = 0;
            let offsetY = 0;
            let contentFound = false;
            let startIndex = 0;
            let lastIndex = 0;

            for(let i = 0; i < area; i++) {
                const rgba = buffer.get('int');
                const [ rgb, alpha ] = rgbaToArgb(rgba);

                if(alpha === 0xff) {
                    // fully transparent
                } else if(!contentFound) {
                    startIndex = i;
                    offsetX = x;
                    offsetY = y;
                    contentFound = true;
                } else {
                    lastIndex = i;
                }

                let paletteIndex = palette.indexOf(rgb);
                if(palette.indexOf(rgb) === -1) {
                    paletteIndex = palette.push(rgb) - 1;
                }

                paletteIndices[i] = paletteIndex;
                alphaValues[i] = alpha;

                x++;
                if(x >= maxWidth) {
                    x = 0;
                    y++;
                }
            }

            // @TODO resize palette and alpha arrays to match the offset and last pixel positions
            // @TODO write footer data
            // @TODO test
        });

        const spriteCount = images.length;
        const spriteWidths: number[] = images.map(png => png.width);
        const spriteHeights: number[] = images.map(png => png.height);
        const maxWidth = Math.max(...spriteWidths);
        const maxHeight = Math.max(...spriteHeights);

        const buffer = new ByteBuffer(100000);

        return null;
    }
} as FileCodec;
