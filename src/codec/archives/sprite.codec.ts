import { ByteBuffer } from '@runejs/core/buffer';
import FileCodec from '../file-codec';
import { PNG } from 'pngjs';
import { toRgb } from '../../client-store';


export class Sprite {
    height: number;
    offsetX: number;
    palette: number[];
    offsetY: number;
    width: number;
    paletteIndices: number[];
    pixels: number[];

    public constructor(public readonly index: number,
                       public readonly overallWidth: number,
                       public readonly overallHeight: number) {
    }
}


function decodeSprite(buffer: ByteBuffer, palette: number[], sprite: Sprite): PNG {
    const { width, height, offsetX, offsetY } = sprite;
    const dimension = width * height;
    const pixelPaletteIndices: number[] = new Array(dimension);
    const pixelAlphas: number[] = new Array(dimension);
    sprite.palette = palette;

    const flags = buffer.get('byte', 'unsigned');

    if((flags & 0b01) === 0) {
        for(let j = 0; j < dimension; j++) {
            pixelPaletteIndices[j] = buffer.get('byte');
        }
    } else {
        for(let x = 0; x < width; x++) {
            for(let y = 0; y < height; y++) {
                pixelPaletteIndices[width * y + x] = buffer.get('byte');
            }
        }
    }

    if((flags & 0b10) === 0) {
        for(let j = 0; j < dimension; j++) {
            const index = pixelPaletteIndices[j];
            if(index !== 0) {
                pixelAlphas[j] = 0xff;
            }
        }
    } else {
        if((flags & 0b01) === 0) {
            for(let j = 0; j < dimension; j++) {
                pixelAlphas[j] = buffer.get('byte');
            }
        } else {
            for(let x = 0; x < width; x++) {
                for(let y = 0; y < height; y++) {
                    pixelAlphas[width * y + x] = buffer.get('byte');
                }
            }
        }
    }

    sprite.paletteIndices = pixelPaletteIndices;
    sprite.pixels = new Array(dimension);

    const png = new PNG({ width, height, filterType: -1 });
    let spriteX: number = 0;
    let spriteY: number = 0;

    for(let d = 0; d < dimension; d++) {
        const index = pixelPaletteIndices[d] & 0xff;
        const pixel = palette[index] | (pixelAlphas[d] << 24);
        sprite.pixels[d] = pixel;
        const [ r, g, b ] = toRgb(pixel);

        const pngIndex = (width * spriteY + spriteX) << 2;
        png.data[pngIndex] = r;
        png.data[pngIndex + 1] = g;
        png.data[pngIndex + 2] = b;
        png.data[pngIndex + 3] = pixel >> 24;

        if(spriteX < width - 1) {
            spriteX++;
        } else {
            spriteX = 0;
            spriteY++;
        }
    }

    try {
        return png.pack();
    } catch(error) {
        return null;
    }
}


export default {
    archive: 'sprites',
    revision: '414-458',

    decode: (buffer: ByteBuffer) => {
        buffer.readerIndex = (buffer.length - 2);
        const spriteCount = buffer.get('short', 'unsigned');
        const sprites: Sprite[] = new Array(spriteCount);

        buffer.readerIndex = (buffer.length - 7 - spriteCount * 8);
        const maxWidth = buffer.get('short', 'unsigned');
        const maxHeight = buffer.get('short', 'unsigned');
        const paletteLength = buffer.get('byte', 'unsigned') + 1;

        for(let i = 0; i < spriteCount; i++) {
            sprites[i] = new Sprite(i, maxWidth, maxHeight);
        }

        for(let i = 0; i < spriteCount; i++) {
            sprites[i].offsetX = buffer.get('short', 'unsigned');
        }
        for(let i = 0; i < spriteCount; i++) {
            sprites[i].offsetY = buffer.get('short', 'unsigned');
        }
        for(let i = 0; i < spriteCount; i++) {
            sprites[i].width = buffer.get('short', 'unsigned');
        }
        for(let i = 0; i < spriteCount; i++) {
            sprites[i].height = buffer.get('short', 'unsigned');
        }

        buffer.readerIndex = (buffer.length - 7 - spriteCount * 8 - (paletteLength - 1) * 3);
        const palette: number[] = new Array(paletteLength);

        for(let i = 1; i < paletteLength; i++) {
            palette[i] = buffer.get('int24');

            if(palette[i] === 0) {
                palette[i] = 1;
            }
        }

        buffer.readerIndex = 0;

        return sprites.map(sprite => {
            const decodedSprite = decodeSprite(buffer, palette, sprite);
            return decodedSprite ? PNG.sync.write(decodedSprite) : null
        }) as Buffer[];
    },

    encode: (data: Buffer | Buffer[]) => {
        if(!data?.length || !data[0]) {
            return null;
        }

        if(data[0] instanceof Buffer) {
            const sprites = data as Buffer[];
        } else {
            const sprite = data as Buffer;
        }

        const buffer = new ByteBuffer(100000);

        return null;
    }
} as FileCodec;
