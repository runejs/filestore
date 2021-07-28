import { ByteBuffer } from '@runejs/core/buffer';
import FileCodec from '../file-codec';
import { PNG } from 'pngjs';
import { toRgb } from '../../client-store';
import { logger } from '@runejs/core';
import { argbToRgba } from '../../util/colors';


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
                       maxWidth: number,
                       maxHeight: number,
                       spriteCount: number) {
        this.fileIndex = fileIndex;
        this.maxWidth = maxWidth;
        this.maxHeight = maxHeight;
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
        buffer.readerIndex = (buffer.length - 2);

        const spriteCount = buffer.get('short', 'unsigned');

        buffer.readerIndex = (buffer.length - 7 - spriteCount * 8);

        const maxWidth = buffer.get('short', 'unsigned');
        const maxHeight = buffer.get('short', 'unsigned');
        const paletteLength = buffer.get('byte', 'unsigned') + 1;

        const spriteSheet = new SpriteSheet(file.fileIndex, maxWidth, maxHeight, spriteCount);

        for(let i = 0; i < spriteCount; i++) {
            spriteSheet.sprites[i] = new Sprite(i, spriteSheet);
        }

        for(let i = 0; i < spriteCount; i++) {
            spriteSheet.sprites[i].offsetX = buffer.get('short', 'unsigned');
        }
        for(let i = 0; i < spriteCount; i++) {
            spriteSheet.sprites[i].offsetY = buffer.get('short', 'unsigned');
        }
        for(let i = 0; i < spriteCount; i++) {
            spriteSheet.sprites[i].width = buffer.get('short', 'unsigned');
        }
        for(let i = 0; i < spriteCount; i++) {
            spriteSheet.sprites[i].height = buffer.get('short', 'unsigned');
        }

        buffer.readerIndex = (buffer.length - 7 - spriteCount * 8 - (paletteLength - 1) * 3);

        spriteSheet.palette = new Array(paletteLength);

        for(let i = 1; i < paletteLength; i++) {
            spriteSheet.palette[i] = buffer.get('int24');

            if(spriteSheet.palette[i] === 0) {
                spriteSheet.palette[i] = 1;
            }
        }

        buffer.readerIndex = 0;

        return spriteSheet.sprites.map(sprite => {
            try {
                const decodedSprite = decodeSprite(buffer, sprite);
                return decodedSprite ? PNG.sync.write(decodedSprite) : null;
            } catch(error) {
                // logger.error(`Error decoding sprite:`, error);
                return null;
            }
        }) as Buffer[];
    },

    encode: (file, data: Buffer | Buffer[]) => {
        if(!data?.length || !data[0]) {
            return null;
        }

        if(data[0] instanceof Buffer) {
            const images = data as Buffer[];
        } else {
            const image = data as Buffer;
            const png = PNG.sync.read(image);
        }

        const buffer = new ByteBuffer(100000);

        return null;
    }
} as FileCodec;
