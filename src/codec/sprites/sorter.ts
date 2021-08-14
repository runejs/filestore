import { ColorFrequency, ColorUsageMap } from './sprite-encoder';
import { HSB, HSL, RGB } from '../../util/colors';


/*
def step (r,g,b, repetitions=1):
    lum = math.sqrt( .241 * r + .691 * g + .068 * b )
    h, s, v = colorsys.rgb_to_hsv(r,g,b)
    h2 = int(h * repetitions)
    lum2 = int(lum * repetitions)
    v2 = int(v * repetitions)
    if h2 % 2 == 1:
        v2 = repetitions - v2
        lum = repetitions - lum
    return (h2, lum, v2)
 */

interface Sort {
    val: number;
    dir: 'asc' | 'desc';
}

type SortOrder = [ Sort, Sort, Sort ];

function sortableColor(rgb: RGB, reps = 1): SortOrder {
    let lum = rgb.luminance;
    const { hue, saturation, lightness } = new HSL(rgb);
    const { brightness } = new HSB(rgb);
    const h = hue / 360;
    const s = saturation / 100;
    const l = lightness / 100;
    const v = brightness / 100;

    const h2 = Math.floor(h * reps);
    let s2 = Math.floor(s * reps);
    let l2 = Math.floor(l * reps);
    let lum2 = Math.floor(lum * reps);
    let v2 = Math.floor(v * reps);
    let hueSatDelta = Math.floor((hue - saturation) * reps);

    if(h2 % 2 === 1) {
        // l2 = reps - l2;
        s2 = reps - s2;
        lum2 = reps - lum2;
        v2 = reps - v2;
        // hueSatDelta = reps - hueSatDelta;
    }

    return [
        {
            val: s2,
            dir: 'asc'
        },
        {
            val: hueSatDelta,
            dir: 'asc'
        },
        {
            val: lum,
            dir: 'asc'
        },
    ];
}


export const sortPalette = (palette: number[]): number[] => {
    return palette.sort((a, b) => colorSorter(a, b));
};


export const colorSorter = (a: number, b: number): number => {
    const threshold = 8;
    const sortOrderA: SortOrder = sortableColor(new RGB(a), threshold);
    const sortOrderB: SortOrder = sortableColor(new RGB(b), threshold);

    for(let i = 0; i < sortOrderA.length; i++) {
        const sortA: Sort = sortOrderA[i];
        const sortB: Sort = sortOrderB[i];

        const { val: valueA, dir } = sortA;
        const valueB = sortB.val;

        if(valueA > valueB) {
            return dir === 'asc' ? -1 : 1;
        } else if(valueA < valueB) {
            return dir === 'asc' ? 1 : -1;
        }
    }

    return 0;
};


export const frequencySorter = (a: ColorFrequency, b: ColorFrequency, usageMap: ColorUsageMap): number => {
    const rgbA = new RGB(a.color);
    const rgbB = new RGB(b.color);
    const hslA = new HSL(rgbA);
    const hslB = new HSL(rgbB);

    if(a.code === '-' || b.code === '-') {
        return 0;
    }

    if(a.frequency > b.frequency) {
        return 1;
    } else if(a.frequency < b.frequency) {
        return -1;
    }

    if(a.code !== '-' && b.code !== '-') {
        if(hslA.lightness > hslB.lightness) {
            return -1;
        } else if(hslA.lightness < hslB.lightness) {
            return 1;
        }
    }

    return 0;

    // return a.frequency - b.frequency;
    /*

    if(rgbA.intensity > rgbB.intensity) {
        //return 1;
    } else if(rgbA.intensity < rgbB.intensity) {
        //return -1;
    }

    if(hslA.lightness > hslB.lightness) {
        return 1;
    } else if(hslA.lightness < hslB.lightness) {
        return -1;
    }

    const rangesA = usageMap[a.color];
    const rangesB = usageMap[b.color];
    if(rangesA && rangesB) {
        if(rangesA.rangeCount > rangesB.rangeCount) {
            //return 1;
        } else if(rangesA.rangeCount < rangesB.rangeCount) {
            //return -1;
        }
    }

    if(a.frequency > b.frequency) {
        return -1;
    } else if(a.frequency < b.frequency) {
        return 1;
    }

    return 0;*/
}
