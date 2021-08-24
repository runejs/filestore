/*const palette: number[] = [];

const spriteCount = images.length;
const maxWidth = images[0].width;
const maxHeight = images[0].height;
const maxArea = maxWidth * maxHeight;

const sprite = images[0];
const pngData = new ByteBuffer(sprite.data);
let minX = -1, minY = -1, maxX = -1, maxY = -1;
let ix = 0, iy = 0;
let pixels: number[][] = new Array(maxHeight);
let alphaValues: number[][] = new Array(maxHeight);
let hasAlpha: boolean = false;

for(let i = 0; i < maxArea; i++) {
    let rgb = pngData.get('int24', 'u');
    let alpha = pngData.get('byte', 'u');

    if(ix === 0) {
        pixels[iy] = new Array(maxWidth);
        alphaValues[iy] = new Array(maxWidth);
    }

    if(rgb === 0 || alpha === 0) {
        rgb = alpha === 0 ? 0 : 1;
    }

    const paletteMapIdx = palette.indexOf(rgb);
    if(paletteMapIdx === -1) {
        palette.push(rgb);
    }

    pixels[iy][ix] = rgb;
    alphaValues[iy][ix] = alpha;

    if(!hasAlpha && alpha !== 255) {
        hasAlpha = true;
    }

    if(rgb !== 0) {
        if(minX === -1 || ix < minX) {
            minX = ix;
        }
        if(minY === -1 || iy < minY) {
            minY = iy;
        }
        if(ix > maxX) {
            maxX = ix;
        }
        if(iy > maxY) {
            maxY = iy;
        }
    }

    ix++;
    if(ix >= maxWidth) {
        ix = 0;
        iy++;
    }
}

const width = maxX - minX + 1;
const height = maxY - minY + 1;
const actualArea = width * height;
const offsetX = minX;
const offsetY = minY;

const rowRanges: { rgb: number, pixels: number }[] = [];
const columnRanges: { rgb: number, pixels: number }[] = [];

const rowAlphaRanges: { alpha: number, count: number }[] = [];
const columnAlphaRanges: { alpha: number, count: number }[] = [];

// row-major order
for(let y = 0; y < height; y++) {
    for(let x = 0; x < width; x++) {
        const rgb = pixels[y + offsetY][x + offsetX];
        const alpha = alphaValues[y + offsetY][x + offsetX];

        if(!rowRanges?.length) {
            rowRanges.push({ rgb, pixels: 1 });
            rowAlphaRanges.push({ alpha, count: 1 });
        } else {
            const lastEntry = rowRanges[rowRanges.length - 1];
            if(lastEntry && lastEntry.rgb === rgb) {
                lastEntry.pixels++;
            } else {
                rowRanges.push({ rgb, pixels: 1 });
            }

            const lastAlphaEntry = rowAlphaRanges[rowAlphaRanges.length - 1];
            if(lastAlphaEntry && lastAlphaEntry.alpha === alpha) {
                lastAlphaEntry.count++;
            } else {
                rowAlphaRanges.push({ alpha, count: 1 });
            }
        }
    }
}

// column-major order
for(let x = 0; x < width; x++) {
    for(let y = 0; y < height; y++) {
        const rgb = pixels[y + offsetY][x + offsetX];
        const alpha = alphaValues[y + offsetY][x + offsetX];

        if(!columnRanges?.length) {
            columnRanges.push({ rgb, pixels: 1 });
            columnAlphaRanges.push({ alpha, count: 1 });
        } else {
            const lastEntry = columnRanges[columnRanges.length - 1];
            if(lastEntry && lastEntry.rgb === rgb) {
                lastEntry.pixels++;
            } else {
                columnRanges.push({ rgb, pixels: 1 });
            }
        }

        const lastAlphaEntry = columnAlphaRanges[columnAlphaRanges.length - 1];
        if(lastAlphaEntry && lastAlphaEntry.alpha === alpha) {
            lastAlphaEntry.count++;
        } else {
            columnAlphaRanges.push({ alpha, count: 1 });
        }
    }
}

let rowPalette: number[] = [];
let columnPalette: number[] = [];

// Count the number of ranges that each color appears in for row-major order
paletteBuilder(rowRanges, rowPalette);

// Count the number of ranges that each color appears in for column-major order
paletteBuilder(columnRanges, columnPalette);


const rowRangeCounts: number = rowRanges.length;
const columnRangeCounts: number = columnRanges.length;

const rowAlphaRangeCounts: number = hasAlpha ? rowAlphaRanges.length : 0;
const columnAlphaRangeCounts: number = hasAlpha ? columnAlphaRanges.length : 0;

const rowRangeTotal = rowRangeCounts + rowAlphaRangeCounts;
const columnRangeTotal = columnRangeCounts + columnAlphaRangeCounts;

let columnDiff: number = 0;
let rowDiff: number = 0;
let previousPaletteIdx = 0;

const rowPaletteIndices: number[] = new Array(actualArea);
const columnPaletteIndices: number[] = new Array(actualArea);

// Build the array of palette indices for row-major order
let ri = 0;
for(let y = 0; y < height; y++) {
    for(let x = 0; x < width; x++) {
        const pixel = pixels[y + offsetY][x + offsetX];
        let paletteIdx = rowPalette.indexOf(pixel);
        if(paletteIdx < 0) {
            paletteIdx = 0;
        }
        rowPaletteIndices[ri++] = paletteIdx;
        rowDiff = paletteIdx - previousPaletteIdx;
        previousPaletteIdx = paletteIdx;
    }
}

previousPaletteIdx = 0;

// Build the array of palette indices for column-major order
for(let x = 0; x < width; x++) {
    for(let y = 0; y < height; y++) {
        const pixel = pixels[y + offsetY][x + offsetX];
        let paletteIdx = columnPalette.indexOf(pixel);
        if(paletteIdx < 0) {
            paletteIdx = 0;
        }
        columnPaletteIndices[width * y + x] = paletteIdx;
        columnDiff = paletteIdx - previousPaletteIdx;
        previousPaletteIdx = paletteIdx;
    }
}

rowDiff = Math.abs(rowDiff);
columnDiff = Math.abs(columnDiff);

const rowGrandTotal = (rowRangeTotal + rowDiff);
const columnGrandTotal = (columnRangeTotal + columnDiff);

const storageMethod: SpriteStorageMethod = rowGrandTotal <= columnGrandTotal ? 'row-major' : 'column-major';

if(spriteCodecMode === 'debug') {
    const expectedStorageMode = spriteCodecDebugSettings?.expectedStorageMode ?? storageMethod;
    if(expectedStorageMode !== storageMethod) {
        console.error(`\nDetected: ${storageMethod}`);
        console.log(`\nRow:\t ranges:${rowRangeTotal} indicesDiff:${rowDiff} total:${rowGrandTotal}`);
        // console.log(`\nRow:\t`, rowRanges);
        console.log(`\nColumn:\t ranges:${columnRangeTotal} indicesDiff:${columnDiff} total:${columnGrandTotal}`);
        // console.log(`\nColumn:\t`, columnRanges);
        if(spriteCodecDebugSettings.expectedTotals) {
            spriteCodecDebugSettings.expectedTotals[1]++;
        }
    } else if(spriteCodecDebugSettings.expectedTotals) {
        spriteCodecDebugSettings.expectedTotals[0]++;
    }

    if(expectedStorageMode === 'row-major') {
        printSpritePaletteIndices(storageMethod, rowPalette, width, height, rowPaletteIndices);
    } else {
        printSpritePaletteIndices(storageMethod, columnPalette, width, height, columnPaletteIndices);
    }
}

console.log(`\n`);*/

/*let pixels: number[][][] = new Array(spriteCount);
let paletteIndices: number[][][] = new Array(spriteCount);
let alphaValues: number[][][] = new Array(spriteCount);
let minX = -1, minY = -1, maxX = -1, maxY = -1;

for(let spriteIdx = 0; spriteIdx < spriteCount; spriteIdx++) {
    const png = images[spriteIdx];
    const { width: maxWidth, height: maxHeight, data } = png;
    const pngData = new ByteBuffer(data);

    pixels[spriteIdx] = new Array(maxHeight);
    paletteIndices[spriteIdx] = new Array(maxHeight);
    alphaValues[spriteIdx] = new Array(maxHeight);

    minX = -1;
    minY = -1;
    maxX = -1;
    maxY = -1;

    // Read all pixel and color data from the original PNG image file

    let previousIdx = -1;
    let consecutive = 0;
    // PNG image pixels are read in row-major order
    for(let y = 0; y < maxHeight; y++) {
        pixels[spriteIdx][y] = new Array(maxWidth);
        alphaValues[spriteIdx][y] = new Array(maxWidth).fill(0);

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

                const paletteMapIdx = paletteMap.findIndex(p => p.color === rgb);
                if(paletteMapIdx === -1) {
                    paletteMap.push({ color: rgb, weight: 1 });
                } else {
                    paletteMap[paletteMapIdx].weight++;
                }

                if(paletteMapIdx !== -1 && previousIdx === paletteMapIdx) {
                    consecutive++;
                    paletteMap[paletteMapIdx].weight += consecutive;
                } else {
                    consecutive = 0;
                }

                previousIdx = paletteMapIdx;

                pixels[spriteIdx][y][x] = rgb ?? 0;
                alphaValues[spriteIdx][y][x] = alpha ?? 255;
            } else {
                pixels[spriteIdx][y][x] = 0;
                alphaValues[spriteIdx][y][x] = 0;
                consecutive = 0;
            }
        }
    }
}

// Sort the color palette array to make the file compress more efficiently

const palette = paletteMap
    .sort((a, b) => {
        if(a.color === 1) {
            return -1;
        } else if(b.color === 1) {
            return 1;
        }

        return b.weight - a.weight;
    }).map(p => p.color);
palette.unshift(0);

for(let spriteIdx = 0; spriteIdx < spriteCount; spriteIdx++) {
    // Now find the color palette index for each individual image pixel within the sorted palette array

    for(let y = 0; y < maxHeight; y++) {
        paletteIndices[spriteIdx][y] = new Array(maxWidth).fill(0);

        for(let x = 0; x < maxWidth; x++) {
            const pixel = pixels[spriteIdx][y][x] ?? 0;
            paletteIndices[spriteIdx][y][x] = palette.indexOf(pixel);
        }
    }


    // Determine whether to store the palette indices in row-major or column-major order
    // To figure this out, we loop through each version of the file and diff the sum
    // of each individual column or row. The resulting diffs of each type are then compared
    // and the smallest one is used to store the pixel index data. In the event of a tie,
    // column-major is used by default.

    const actualWidth = maxX - minX;
    const actualHeight = maxY - minY;
    const actualArea = actualWidth * actualHeight;
    const offsetX = minX;
    const offsetY = minY;

    const columnResized: number[] = new Array(actualArea);
    const rowResized: number[] = new Array(actualArea);

    let resizedIdx = 0;
    let columnDiff: number = 0;
    let rowDiff: number = 0;

    let previousDiff = 0;
    for(let x = offsetX; x < actualWidth + offsetX; x++) {
        let previousPaletteIdx = 0;
        let diff = 0;

        for(let y = offsetY; y < actualHeight + offsetY; y++) {
            const paletteIdx = paletteIndices[spriteIdx][y][x] ?? 0;
            columnResized[resizedIdx++] = paletteIdx;
            diff += paletteIdx;
            previousPaletteIdx = paletteIdx;
        }

        columnDiff += diff - previousDiff;
        previousDiff = diff;
    }

    resizedIdx = 0;
    previousDiff = 0;

    for(let y = offsetY; y < actualHeight + offsetY; y++) {
        let previousPaletteIdx = 0;
        let diff = 0;

        for(let x = offsetX; x < actualWidth + offsetX; x++) {
            const paletteIdx = paletteIndices[spriteIdx][y][x] ?? 0;
            rowResized[resizedIdx++] = paletteIdx;
            diff += paletteIdx;
            previousPaletteIdx = paletteIdx;
        }

        rowDiff += diff - previousDiff;
        previousDiff = diff;
    }

    rowDiff = Math.abs(rowDiff);
    columnDiff = Math.abs(columnDiff);

    const storageMethod: SpriteStorageMethod = columnDiff < rowDiff ? 'column-major' : 'row-major';

    //if(codecMode && codecMode !== storageMethod) {
        console.log(`File Name:\t${file.fileName}`);
        console.warn(`Detected:\t${storageMethod}`);
        console.log(`Column Diff:\t${columnDiff}`);
        console.log(`Row Diff:\t${rowDiff}`);
        console.log('Palette:\t' + palette.join(' '));
        // console.log('Alphas:\t' + alphaValues.join(' '));
        console.log('\n');
    //}

    // @TODO write footer data
    // @TODO test
}

const paletteLength = palette.length;

const buffer = new ByteBuffer(100000);*/
