import { GroupTranscoder } from '../group-transcoder';
import { Sprite } from './sprite';
import { ByteBuffer } from '@runejs/common';


export class SpriteTranscoder extends GroupTranscoder<Sprite[]> {

    override decodeGroup(groupKey: number): Sprite[] | null;
    override decodeGroup(groupName: string): Sprite[] | null;
    override decodeGroup(groupKeyOrName: number | string): Sprite[] | null {
        const group = this.findGroup(groupKeyOrName);
        if(!group) {
            return null;
        }

        const {
            numericKey: spritePackKey,
            name: spritePackName,
            data: fileData
        } = group;

        fileData.readerIndex = (fileData.length - 2);
        const spriteCount = fileData.get('short', 'u');
        const sprites: Sprite[] = new Array(spriteCount);

        this.decodedGroups.set(spritePackKey, sprites);

        fileData.readerIndex = (fileData.length - 7 - spriteCount * 8);
        const width = fileData.get('short', 'u');
        const height = fileData.get('short', 'u');
        const paletteLength = fileData.get('byte', 'u') + 1;

        for(let i = 0; i < spriteCount; i++) {
            const sprite = sprites[i] = new Sprite();
            sprite.spritePackKey = spritePackKey;
            sprite.spritePackName = spritePackName;
            sprite.spriteIdx = i;
            sprite.width = width;
            sprite.height = height;
        }

        for(let i = 0; i < spriteCount; i++) {
            sprites[i].offsetX = fileData.get('short', 'u');
        }
        for(let i = 0; i < spriteCount; i++) {
            sprites[i].offsetY = fileData.get('short', 'u');
        }
        for(let i = 0; i < spriteCount; i++) {
            sprites[i].width = fileData.get('short', 'u');
        }
        for(let i = 0; i < spriteCount; i++) {
            sprites[i].height = fileData.get('short', 'u');
        }

        fileData.readerIndex = (fileData.length - 7 - spriteCount * 8 - (paletteLength - 1) * 3);
        const palette: number[] = new Array(paletteLength);

        for(let i = 1; i < paletteLength; i++) {
            palette[i] = fileData.get('int24');

            if(palette[i] === 0) {
                palette[i] = 1;
            }
        }

        fileData.readerIndex = 0;

        for(let i = 0; i < spriteCount; i++) {
            const sprite = sprites[i];
            const spriteWidth = sprite.width;
            const spriteHeight = sprite.height;
            const dimension = spriteWidth * spriteHeight;
            const pixelPaletteIndexes: number[] = new Array(dimension);
            const pixelAlphas: number[] = new Array(dimension);
            sprite.palette = palette;

            const flags = fileData.get('byte', 'u');

            if((flags & 0b01) === 0) {
                for(let j = 0; j < dimension; j++) {
                    pixelPaletteIndexes[j] = fileData.get('byte');
                }
            } else {
                for(let x = 0; x < spriteWidth; x++) {
                    for(let y = 0; y < spriteHeight; y++) {
                        pixelPaletteIndexes[spriteWidth * y + x] = fileData.get('byte');
                    }
                }
            }

            if((flags & 0b10) === 0) {
                for(let j = 0; j < dimension; j++) {
                    const index = pixelPaletteIndexes[j];
                    if(index !== 0) {
                        pixelAlphas[j] = 0xff;
                    }
                }
            } else {
                if((flags & 0b01) === 0) {
                    for(let j = 0; j < dimension; j++) {
                        pixelAlphas[j] = fileData.get('byte');
                    }
                } else {
                    for(let x = 0; x < spriteWidth; x++) {
                        for(let y = 0; y < spriteHeight; y++) {
                            pixelAlphas[spriteWidth * y + x] = fileData.get('byte');
                        }
                    }
                }
            }

            sprite.pixelIdx = pixelPaletteIndexes;
            sprite.pixels = new Array(dimension);

            for(let j = 0; j < dimension; j++) {
                const index = pixelPaletteIndexes[j] & 0xff;
                sprite.pixels[j] = palette[index] | (pixelAlphas[j] << 24);
            }
        }

        return sprites;
    }

    override encodeGroup(groupKey: number): ByteBuffer | null;
    override encodeGroup(groupName: string): ByteBuffer | null;
    override encodeGroup(groupKeyOrName: number | string): ByteBuffer | null {
        const group = this.findGroup(groupKeyOrName);
        const decodedGroup = this.decodedGroups.get(group.numericKey) || null;

        // @todo encode the decodedGroup back into binary format

        return null;
    }

}
