import { PNG } from 'pngjs';
import { SpriteSheet } from './sprite-sheet';
import { ByteBuffer } from '@runejs/core/buffer';
import { RGB } from '../../util/colors';


interface ImageData {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    pixels: number[][];
    intensities: number[][];
    alphas: number[][];
    hasAlpha: boolean;
}

interface Pixfreq {
    pix: number;
    larrloc: number;
    rarrloc: number;
    freq: number;
    left: Pixfreq;
    right: Pixfreq;
    code: string[];
}

interface Huffcode {
    pix: number;
    arrloc: number;
    freq: number;
}


const fib = (n: number): number => {
    if(n <= 1) {
        return n;
    }

    return fib(n - 1) + fib(n - 2);
};

const codelen = (code: string[]): number => code.includes('\0') ? code.indexOf('\0') : 0;

const strconcat = (str: string[], parentcode: string[], add: string) => {
    let i = 0;
    while(parentcode[i] !== '\0') {
        str[i] = parentcode[i];
        i++;
    }

    if (add !== '2') {
        str[i] = add;
        str[i + 1] = '\0';
    } else {
        str[i] = '\0';
    }
}



const encodeSprite = (image: PNG): void => {

};


const readImageData = (spriteSheet: SpriteSheet, image: PNG): ImageData => {
    const pngData = new ByteBuffer(image.data);
    const { maxWidth, maxHeight, maxArea, palette } = spriteSheet;
    let minX = -1, minY = -1, maxX = -1, maxY = -1;
    let x = 0, y = 0;
    const pixels: number[][] = new Array(maxHeight);
    const intensities: number[][] = new Array(maxHeight);
    const alphas: number[][] = new Array(maxHeight);
    let hasAlpha: boolean = false;

    for(let i = 0; i < maxArea; i++) {
        let rgb = pngData.get('int24', 'u');
        let alpha = pngData.get('byte', 'u');

        if(x === 0) {
            pixels[y] = new Array(maxWidth);
            intensities[y] = new Array(maxWidth);
            alphas[y] = new Array(maxWidth);
        }

        if(rgb === 0 || alpha === 0) {
            rgb = alpha === 0 ? 0 : 1;
        }

        const paletteMapIdx = palette.indexOf(rgb);
        if(paletteMapIdx === -1) {
            palette.push(rgb);
        }

        pixels[y][x] = rgb;
        intensities[y][x] = new RGB(rgb).intensity;
        alphas[y][x] = alpha;

        if(!hasAlpha && alpha !== 255) {
            hasAlpha = true;
        }

        if(rgb !== 0) {
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
        }

        x++;
        if(x >= maxWidth) {
            x = 0;
            y++;
        }
    }

    return { minX, maxX, minY, maxY, pixels, intensities, alphas, hasAlpha };
};


export const encodeSpriteSheet = (fileIndex: number, fileName: string, images: PNG[]): void => {
    const spriteSheet = new SpriteSheet(fileIndex, fileName, images);
    const imageData: ImageData[] = new Array(spriteSheet.sprites.length);
    const histogram: number[] = new Array(256).fill(0);

    for(let imageIdx = 0; imageIdx < images.length; imageIdx++) {
        const image = images[imageIdx];

        imageData[imageIdx] = readImageData(spriteSheet, image);
        const { minX, maxX, minY, maxY, intensities } = imageData[imageIdx];

        const width = maxX - minX + 1;
        const height = maxY - minY + 1;

        for(let y = 0; y < height; y++) {
            for(let x = 0; x < width; x++) {
                histogram[intensities[y + minY][x + minX]] += 1;
            }
        }
    }

    const { maxHeight, maxWidth, maxArea } = spriteSheet;

    let nodes: number = 0;
    for(let i = 0; i < 256; i++) {
        if(histogram[i] !== 0) {
            nodes++;
        }
    }

    // Calculating minimum probability
    let minProbability = 1.0, tempMinProb;
    for(let i = 0; i < 256; i++) {
        tempMinProb = (histogram[i] / maxArea);
        if(tempMinProb > 0 && tempMinProb <= minProbability) {
            minProbability = tempMinProb;
        }
    }

    // Calculating max length of the code word
    let codeLen = 0;
    while((1 / minProbability) > fib(codeLen)) {
        codeLen++;
    }

    const maxCodeWordLength = codeLen - 3;
    const totalNodes = 2 * nodes - 1;

    const pixfreqs: Pixfreq[] = new Array(totalNodes).fill({
        pix: 0,
        larrloc: 0,
        rarrloc: 0,
        freq: 0,
        left: null,
        right: null,
        code: new Array(maxCodeWordLength)
    });

    const huffcodes: Huffcode[] = new Array(totalNodes).fill({
        pix: 0,
        arrloc: 0,
        freq: 0
    });

    let j = 0;
    let tempProbability: number;
    for(let i = 0; i < 256; i++) {
        if(histogram[i] === 0) {
            continue;
        }

        // pixel intensity value
        huffcodes[j].pix = i;
        pixfreqs[j].pix = i;

        // location of the node in the pixfreqs array
        huffcodes[j].arrloc = j;

        // probability of occurrence
        tempProbability = histogram[i] / maxArea;
        pixfreqs[j].freq = tempProbability;
        huffcodes[j].freq = tempProbability;

        // initializing the code
        // word as end of line
        pixfreqs[j].code[0] = '\0';
        j++;
    }

    // Sorting with respect to probability of occurrence
    let tempHuff: Huffcode;
    for(let i = 0; i < nodes; i++) {
        for(let j = i + 1; j < nodes; j++) {
            if(huffcodes[i].freq < huffcodes[j].freq) {
                tempHuff = huffcodes[i];
                huffcodes[i] = huffcodes[j];
                huffcodes[j] = tempHuff;
            }
        }
    }

    // Building the huffman tree

    let sumprob: number;
    let sumpix: number;
    let n = 0, k = 0;
    let nextnode = nodes;

    while(n < nodes - 1) {

        // Adding the lowest two probabilities
        sumprob = huffcodes[nodes - n - 1].freq + huffcodes[nodes - n - 2].freq;
        sumpix = huffcodes[nodes - n - 1].pix + huffcodes[nodes - n - 2].pix;

        // Appending to the pix_freq Array
        pixfreqs[nextnode].pix = sumpix;
        pixfreqs[nextnode].freq = sumprob;
        pixfreqs[nextnode].left = pixfreqs[huffcodes[nodes - n - 2].arrloc];
        pixfreqs[nextnode].right = pixfreqs[huffcodes[nodes - n - 1].arrloc];
        pixfreqs[nextnode].code[0] = '\0';
        let i = 0;

        // Sorting and Updating the
        // huffcodes array simultaneously
        // New position of the combined node
        while(sumprob <= huffcodes[i].freq) {
            i++;
        }

        // Inserting the new node
        // in the huffcodes array
        for(k = nodes; k >= 0; k--) {
            if(k === i) {
                huffcodes[k].pix = sumpix;
                huffcodes[k].freq = sumprob;
                huffcodes[k].arrloc = nextnode;
            } else if (k > i) {
                // Shifting the nodes below
                // the new node by 1
                // For inserting the new node
                // at the updated position k
                huffcodes[k] = huffcodes[k - 1];
            }
        }
        n += 1;
        nextnode += 1;
    }
};
