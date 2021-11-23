import { ByteBuffer } from '@runejs/common/buffer';
import { FileTranscoder, toBuffer, TranscoderOptions } from '../file-transcoder';
import { PNG } from 'pngjs';
import { logger } from '@runejs/common';
import { dumpSpriteSheetData } from './sprite-debug';
import { Sprite, SpriteSheet, SpriteStorageMethod } from './sprite-sheet';
import { encodeSpriteSheet } from './sprite-encoder';
import { RGBA } from '../../util';
import { Buffer } from 'buffer';



export interface SpriteCodecOptions extends TranscoderOptions {
    forceStorageMethod?: SpriteStorageMethod;
}


const spriteCodec: FileTranscoder<SpriteSheet, SpriteCodecOptions> = {
    archive: 'sprites',
    revision: '414-458',

    decode: (fileInfo, fileData, options?) => {
        // Reverse the fileData so we can pull the sprite information from the footer
        const reversedBuffer = new ByteBuffer(new ByteBuffer(fileData).reverse());

        // Read the number of sprites in this pack
        const spriteCount = reversedBuffer.get('short', 'unsigned', 'le');

        const spriteSheet = new SpriteSheet(fileInfo, spriteCount);

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

        // Now read the individual sprites from the beginning of the fileInfo
        const spriteBuffers = spriteSheet.sprites.map(sprite => {
            try {
                const decodedSprite: PNG = sprite.decompress(
                    fileData instanceof ByteBuffer ? fileData : new ByteBuffer(fileData));
                return decodedSprite ? new ByteBuffer(PNG.sync.write(decodedSprite)) : null;
            } catch(error) {
                if(fileData?.length) {
                    logger.error(`Error decoding sprite:`, error);
                }
                return null;
            }
        });

        spriteSheet.setData('rjs', spriteBuffers);

        if(options?.debug) {
            dumpSpriteSheetData(spriteSheet);
        }

        return spriteSheet;
    },

    encode: (fileInfo, fileData, options?) => {
        const data: Buffer[] = toBuffer(fileData);
        let images: PNG[] = data.map((b, i) => {
            try {
                return PNG.sync.read(b);
            } catch(error) {
                logger.error(`Error encoding sprite[${i}]:`, fileInfo, error);
                return null;
            }
        }).map(png => png?.data?.length ? png : null);

        if(!images?.length) {
            logger.error(`Unable to encode sprite file.`);
            return null;
        }

        const transcodingResponse = encodeSpriteSheet(fileInfo, images, options);

        if(!transcodingResponse?.successful || !transcodingResponse?.file) {
            logger.warn(`Issues found during sprite encoding.`);
            return null;
        }

        return transcodingResponse.file;
    }
};

export default spriteCodec;
