import { PNG } from 'pngjs';
import { SpriteSheet } from './sprite-sheet';
import { RGBA } from '../../util';
import { sortPalette } from './sorter';
import { SpriteCodecOptions } from './sprite.transcoder';
import { printSpritePaletteIndices } from './sprite-debug';
import { PixelHistogram, PngSpriteReader } from './png-sprite-reader';
import { TranscodingResponse } from '../file-transcoder';
import { FileInfo } from '../../file-store/file';


export const encodeSpriteSheet = (
    fileInfo: FileInfo,
    pngSprites: PNG[],
    options?: SpriteCodecOptions): TranscodingResponse<SpriteSheet> => {

    const spriteSheet = new SpriteSheet(fileInfo, pngSprites);
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
        const { pixelIndices: { row: rowPixelIndices, col: colPixelIndices },
            alphas: { row: rowAlphas, col: colAlphas }} = histogram;

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
        sprite.alphas = computedStorageMethod === 'column-major' ? colAlphas : rowAlphas;



        // @TODO construct sprite mini-buffer
    }

    spriteSheet.setData('js5', null); // @TODO construct spritesheet file buffer

    return {
        file: spriteSheet,
        successful
    };
};
