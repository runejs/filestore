import { PNG } from 'pngjs';
import { SpriteSheet } from './sprite-sheet';
import { ByteBuffer } from '@runejs/core/buffer';
import { RGBA } from '../../util';
import { sortPalette } from './sorter';
import { SpriteCodecOptions } from './sprite.codec';
import { printSpritePaletteIndices } from './sprite-debug';
import { PixelHistogram, PngSpriteData, PngSpriteReader } from './png-sprite-reader';


export interface EncodedSpriteSheet {
    data: ByteBuffer;
    successful: boolean;
}


export const encodeSpriteSheet = (fileIndex: number, fileName: string, pngSprites: PNG[], options?: SpriteCodecOptions): EncodedSpriteSheet | null => {
    const spriteSheet = new SpriteSheet(fileIndex, fileName, pngSprites);
    const pngSpriteReader = new PngSpriteReader(spriteSheet, pngSprites);
    const spriteHistograms: PixelHistogram[] = new Array(pngSprites.length);
    let palette = spriteSheet.palette;
    let successful: boolean = true;

    for(let spriteIndex = 0; spriteIndex < pngSprites.length; spriteIndex++) {
        const sprite = pngSpriteReader.readSprite(spriteIndex);

        if(options?.debug && options?.forceStorageMethod) {
            sprite.storageMethod = options.forceStorageMethod;
        }

        spriteHistograms[spriteIndex] = new PixelHistogram(sprite);
    }

    palette = [ new RGBA(0, 0, 0, 0), ...sortPalette(palette) ];
    spriteHistograms.forEach(histogram => histogram?.buildHistogram(palette));

    for(let spriteIndex = 0; spriteIndex < pngSprites.length; spriteIndex++) {
        const sprite = pngSpriteReader.spriteData[spriteIndex];
        const { width, height } = sprite;
        const histogram = spriteHistograms[spriteIndex];
        const { pixelIndices: { row: rowPixelIndices, col: colPixelIndices }} = histogram;

        const rowOrderWeight = histogram.calculateWeight('row');
        const colOrderWeight = histogram.calculateWeight('col');

        const computedStorageMethod = colOrderWeight < rowOrderWeight ? 'column-major' : 'row-major';

        if(options?.debug) {
            if(options?.forceStorageMethod === 'row-major') {
                printSpritePaletteIndices('row-major', width, height, rowPixelIndices, palette);
            } else if(options?.forceStorageMethod === 'column-major') {
                printSpritePaletteIndices('column-major', width, height, colPixelIndices, palette);
            }

            console.log(`Column diff ${colOrderWeight}`);
            console.log(`Row diff ${rowOrderWeight}`);

            if(computedStorageMethod !== sprite.storageMethod) {
                console.warn(`Computed storage method does not match the original.`);
                successful = false;
            }
        }

        sprite.storageMethod = computedStorageMethod;
        sprite.indexedPixels = computedStorageMethod === 'column-major' ? colPixelIndices : rowPixelIndices;
        // sprite.alphas = computedStorageMethod === 'column-major' ? columnAlphas : rowAlphas; @TODO

        // @TODO construct sprite mini-buffer
    }

    return { data: new ByteBuffer(1), successful }; // @TODO
};
