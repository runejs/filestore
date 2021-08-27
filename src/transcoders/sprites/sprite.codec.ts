import { ByteBuffer } from '@runejs/core/buffer';
import { FileTranscoder, TranscoderOptions } from '../file-transcoder';
import { PNG } from 'pngjs';
import { logger } from '@runejs/core';
import { dumpSpriteSheetData } from './sprite-debug';
import { Sprite, SpriteSheet, SpriteStorageMethod } from './sprite-sheet';
import { encodeSpriteSheet } from './sprite-encoder';
import { RGBA } from '../../util/colors';



export interface SpriteCodecOptions extends TranscoderOptions {
    forceStorageMethod?: SpriteStorageMethod;
}


const spriteCodec: FileTranscoder<SpriteCodecOptions> = {
    archive: 'sprites',
    revision: '414-458',

    decode: (file, buffer, options?) => {
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
            let color = reversedBuffer.get('int24', 'signed', 'le');

            // converts the color 0 (black) into the int 1 to differentiate between black and transparent (0 is used for fully transparent pixels)
            if(color === 0) {
                color = 1;
            }

            spriteSheet.palette[i] = new RGBA(color, 255);
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

        if(options?.debug) {
            dumpSpriteSheetData(spriteSheet);
        }

        return spriteBuffers;
    },

    encode: (file, data, options?) => {
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

        if(!encodeSpriteSheet(file.fileIndex, file.fileName, images, options)) {
            logger.warn(`Issues found during sprite encoding.`);
            return null;
        }

        return new ByteBuffer(1);
    }
};

export default spriteCodec;
