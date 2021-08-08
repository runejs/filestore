import { PNG } from 'pngjs';
import { logger } from '@runejs/core';
import { ByteBuffer } from '@runejs/core/buffer';
import { RGBA } from '../../util/colors';


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
                    pngData.put(new RGBA(this.pixels[i], this.getAlpha(i)).toInt(), 'int');
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
