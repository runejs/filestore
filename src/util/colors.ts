import { padNumber } from './strings';
import { toDegrees } from './math';


export type ColorType = 'argb' | 'rgb' | 'rgba' | 'hsl' | 'hsb' | 'hcl' | 'lab';

export interface RGBValues {
    r: number;
    g: number;
    b: number;
    a?: number;
}

export interface IColor {
    toString(): string;
}

function rgbInfo(rgb: RGB) {
    const { red, green, blue } = rgb;
    const { r, g, b } = rgb.toDecimals();

    const max = Math.max(Math.max(r, g), b);
    const min = Math.min(Math.min(r, g), b);
    const delta = max - min;
    let h, s = max === 0 ? 0 : delta / max;

    if(max === min) {
        h = s = 0; // achromatic
    } else {
        switch(max) {
            case r: h = (g - b) / delta + (g < b ? 6 : 0); break;
            case g: h = (b - r) / delta + 2; break;
            case b: h = (r - g) / delta + 4; break;
        }

        h /= 6;
    }

    return { h, s, max, min, delta, r, g, b, red, green, blue };
}

function triplePad(i: number, fractionDigits: number = 0): string {
    return padNumber(i, 3, {
        fractionDigits
    });
}

function round(i: number, fractionDigits: number = 0): number {
    if(isNaN(i) || i < 0) {
        return 0;
    }

    if(fractionDigits === 0) {
        return Math.floor(i);
    } else {
        return Number(i.toFixed(fractionDigits));
    }
}



export class HSB implements IColor {

    public hue: number;
    public saturation: number;
    public brightness: number;

    public rgb: RGB | undefined; // @TODO getter for runtime conversions

    public constructor(rgb24Integer: number);
    public constructor(rgb: RGB);
    public constructor(hue: number, saturation: number, brightness: number);
    public constructor(arg0: number | RGB, saturation?: number, brightness?: number) {
        let hue = arg0;
        if(saturation === undefined && brightness === undefined) {
            this.rgb = typeof arg0 === 'number' ? new RGB(arg0) : arg0;
            const { h, s, b } = HSB.fromRgb(this.rgb);
            hue = h;
            saturation = s;
            brightness = b;
        }

        this.hue = hue as number;
        this.saturation = saturation;
        this.brightness = brightness;
    }

    public static fromRgb(rgb: RGB): { h: number, s: number, b: number } {
        if(rgb.isPureBlack) {
            return { h: 360, s: 100, b: 0 };
        }

        const { h, s, max: v } = rgbInfo(rgb);
        return {
            h: round(h * 360, 1),
            s: round(s * 100, 1),
            b: round(v * 100, 1)
        };
    }

    public toString(): string {
        return `HSB ( ${triplePad(this.hue, 1)}, ${triplePad(this.saturation, 1)}%, ` +
            `${triplePad(this.brightness, 1)}% ) hueSatDelta ( ${(this.hue - this.saturation).toFixed(1)} )`;
    }

}


export class HSL implements IColor {

    public hue: number;
    public saturation: number;
    public lightness: number;

    public rgb: RGB | RGBA | undefined; // @TODO getter for runtime conversions

    public constructor(rgb24Integer: number);
    public constructor(rgba: RGBA);
    public constructor(rgb: RGB);
    public constructor(hue: number, saturation: number, lightness: number);
    public constructor(arg0: number | RGB | RGBA, saturation?: number, lightness?: number) {
        let hue = arg0;
        if(saturation === undefined && lightness === undefined) {
            this.rgb = typeof arg0 === 'number' ? new RGB(arg0) : arg0;
            const { h, s, l } = HSL.fromRgb(this.rgb);
            hue = h;
            saturation = s;
            lightness = l;
        }

        this.hue = hue as number;
        this.saturation = saturation;
        this.lightness = lightness;
    }

    public static fromRgb(rgb: RGB): { h: number, s: number, l: number } {
        if(rgb.isPureBlack) {
            return { h: 0, s: 0, l: 0 };
        }

        const { h, s, max, min } = rgbInfo(rgb);
        const l = (max + min) / 2;
        return {
            h: round(h * 360, 0),
            s: round(s * 100, 0),
            l: round(l * 100, 0)
        };
    }

    public toString(): string {
        const threshold = 4;
        return `HSL ( ${triplePad(this.hue, 1)}, ${triplePad(this.saturation, 1)}%, ` +
            `${triplePad(this.lightness, 1)}% ) grayscale ( ${((this.hue / 240 * 100) - this.saturation).toFixed(1)} ) ` +
            `rating ( ${Math.floor(this.hue / 240 * threshold)}, ${Math.floor(this.saturation / 100 * threshold)}, ` +
            `${Math.floor(this.lightness / 100 * threshold)} )`;
    }

    public equals(other: HSL): boolean {
        return this.hue === other.hue && this.saturation === other.saturation && this.lightness === other.lightness;
    }

}


export class HCL implements IColor {

    public hue: number;
    public chroma: number;
    public luminance: number;

    public rgb: RGB | undefined; // @TODO getter for runtime conversions

    public constructor(rgb24Integer: number);
    public constructor(rgb: RGB);
    public constructor(hue: number, chroma: number, luminance: number);
    public constructor(arg0: number | RGB, chroma?: number, luminance?: number) {
        let hue = arg0;
        if(chroma === undefined && luminance === undefined) {
            this.rgb = typeof arg0 === 'number' ? new RGB(arg0) : arg0;
            const { h, c, l } = HCL.fromRgb(this.rgb);
            hue = h;
            chroma = c;
            luminance = l;
        }

        this.hue = hue as number;
        this.chroma = chroma;
        this.luminance = luminance;
    }

    public static fromRgb(rgb: RGB): { h: number, c: number, l: number } {
        if(rgb.isPureBlack) {
            return { h: 0, c: 0, l: 0 };
        }

        const { red, green, blue, r, g, b, h, min, max } = rgbInfo(rgb);

        // const [ h, c, l ] = toHCL(red, green, blue);

        // const min = Math.min(Math.min(red, green), blue);
        // const max = Math.max(Math.max(red, green), blue);
        let c, l: number;

        const Y0 = 100;
        const gamma = 3;

        if(max === 0) {
            c = 0;
            l = 0;
        } else {
            let alpha = (min / max) / Y0;
            let Q = Math.exp(alpha * gamma);
            let rg = r - g;
            let gb = g - b;
            let br = b - r;
            l = ((Q * max) + ((1 - Q) * min)) / 2;
            c = Q * (Math.abs(rg) + Math.abs(gb) + Math.abs(br)) / 3;
            // h = toDegrees(Math.atan2(gb, rg));


            // if (rg >= 0 && gb >= 0) {
            //     h = 2 * h / 3;
            // } else if (rg >= 0 && gb < 0) {
            //     h = 4 * h / 3;
            // } else if (rg < 0 && gb >= 0) {
            //     h = 180 + 4 * h / 3;
            // } else if (rg < 0 && gb < 0) {
            //     h = 2 * h / 3 - 180;
            // }


            // if(rg <  0) {
            //     if (gb >= 0) {
            //         h = 90 + h;
            //     } else {
            //         h = h - 90;
            //     }
            // }
        }

        return {
            h: round(h * 360, 0),
            c: round(c * 100, 1),
            l: round(l * 100, 1)
        };
    }

    public toString(): string {
        return `HCL ( ${triplePad(this.hue, 0)}, ${triplePad(this.chroma, 1)}%, ` +
            `${triplePad(this.luminance, 1)}% )`;
    }

}


export class LAB implements IColor {

    public lightness: number;
    public a: number;
    public b: number;

    public rgb: RGB | undefined; // @TODO getter for runtime conversions

    public constructor(argb: number);
    public constructor(rgb: RGB);
    public constructor(lightness: number, a: number, b: number);
    public constructor(arg0: number | RGB, a?: number, b?: number) {
        if(typeof arg0 !== 'number' || a === undefined) {
            this.rgb = typeof arg0 === 'number' ? new RGB(arg0) : arg0;
            const { l, a, b } = LAB.fromRgb(this.rgb);
            this.lightness = l;
            this.a = a;
            this.b = b;
        } else {
            this.a = a;
            this.b = b;
            this.lightness = arg0;
        }
    }

    public static fromRgb(rgb: RGB): { l: number, a: number, b: number } {
        if(rgb.isPureBlack) {
            return { l: 0, a: 0, b: 0 };
        }

        let { r, g, b } = rgbInfo(rgb);

        r = (r > 0.04045) ? Math.pow((r + 0.055) / 1.055, 2.4) : r / 12.92;
        g = (g > 0.04045) ? Math.pow((g + 0.055) / 1.055, 2.4) : g / 12.92;
        b = (b > 0.04045) ? Math.pow((b + 0.055) / 1.055, 2.4) : b / 12.92;

        let x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
        let y = (r * 0.2126 + g * 0.7152 + b * 0.0722) / 1.00000;
        let z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;

        x = (x > 0.008856) ? Math.pow(x, 1/3) : (7.787 * x) + 16 / 116;
        y = (y > 0.008856) ? Math.pow(y, 1/3) : (7.787 * y) + 16 / 116;
        z = (z > 0.008856) ? Math.pow(z, 1/3) : (7.787 * z) + 16 / 116;

        return {
            l: round((116 * y) - 16, 1),
            a: round(500 * (x - y), 1),
            b: round(200 * (y - z), 1)
        };
    }

    public toString(): string {
        return `LAB ( ${triplePad(this.lightness, 1)}, ${triplePad(this.a, 1)}, ` +
            `${triplePad(this.b, 1)} ) average ( ${this.average })`;
    }

    public delta(other: LAB): number {
        const deltaL = this.lightness - other.lightness;
        const deltaA = this.a - other.a;
        const deltaB = this.b - other.b;
        const c1 = Math.sqrt(this.a * this.a + this.b * this.b);
        const c2 = Math.sqrt(other.a * other.a + other.b * other.b);
        const deltaC = c1 - c2;
        let deltaH = deltaA * deltaA + deltaB * deltaB - deltaC * deltaC;
        deltaH = deltaH < 0 ? 0 : Math.sqrt(deltaH);
        const sc = 1.0 + 0.045 * c1;
        const sh = 1.0 + 0.015 * c1;
        const deltaLKlsl = deltaL / (1.0);
        const deltaCkcsc = deltaC / (sc);
        const deltaHkhsh = deltaH / (sh);
        const i = deltaLKlsl * deltaLKlsl + deltaCkcsc * deltaCkcsc + deltaHkhsh * deltaHkhsh;
        return i < 0 ? 0 : Math.sqrt(i);
    }

    public get average(): number {
        return Math.floor((this.lightness + this.a + this.b) / 3);
    }

}


export class RGB implements IColor {

    public argb: number; // @TODO getter for runtime conversions
    public red: number;
    public green: number;
    public blue: number;

    public constructor(argb: number);
    public constructor(red: number, green: number, blue: number);
    public constructor(arg0: number, green?: number, blue?: number) {
        let red = arg0;

        if(green === undefined && blue === undefined) {
            this.argb = arg0;
            arg0 >>>= 0;
            blue = arg0 & 0xFF;
            green = (arg0 & 0xFF00) >>> 8;
            red = (arg0 & 0xFF0000) >>> 16;
        }

        this.red = red ?? 0;
        this.green = green ?? 0;
        this.blue = blue ?? 0;
    }

    public equals(other: RGB): boolean {
        if(this.red !== other.red) {
            return false;
        }
        if(this.green !== other.green) {
            return false;
        }
        return this.blue === other.blue;
    }

    public toDecimals(): RGBValues {
        return {
            r: this.red / 255,
            g: this.green / 255,
            b: this.blue / 255
        }
    }

    public toString(): string {
        return `RGB ( ${triplePad(this.red)}, ${triplePad(this.green)}, ${triplePad(this.blue)} ) ` +
            `intensity ( ${triplePad(this.intensity)} ) luminance ( ${this.luminance} ) ` +
            `grayscale ( ${triplePad(this.grayscale)} )`;
    }

    public delta(other: RGB): number {
        const { red: r1, green: g1, blue: b1 } = this;
        const { red: r2, green: g2, blue: b2 } = other;

        const drp2 = Math.pow(r1 - r2, 2),
            dgp2 = Math.pow(g1 - g2, 2),
            dbp2 = Math.pow(b1 - b2, 2),
            t = (r1 + r2) / 2

        return Math.sqrt(2 * drp2 + 4 * dgp2 + 3 * dbp2 + t * (drp2 - dbp2) / 256);
    }

    public toRgbaInt(): number {
        return (this.red << 24) + (this.green << 16) + (this.blue << 8) + 255;
    }

    public add(other: RGB): void {
        this.red += other.red;
        this.green += other.green;
        this.blue += other.blue;

        if(this.red > 255) {
            this.red -= 255;
        }
        if(this.green > 255) {
            this.green -= 255;
        }
        if(this.blue > 255) {
            this.blue -= 255;
        }

        if(this.red < 0) {
            this.red += 255;
        }
        if(this.green < 0) {
            this.green += 255;
        }
        if(this.blue < 0) {
            this.blue += 255;
        }
    }

    public get intensity(): number {
        return Math.round((this.red + this.green + this.blue) / 3);
    }

    public get total(): number {
        return this.green + this.blue + this.red;
    }

    public get grayscale(): number {
        return Math.abs(Math.max(this.red, this.green) - this.blue);
    }

    public get luminance(): number {
        return  ((.2126 * this.red) + (.7152 * this.green) + (.0722 * this.blue)) / 255;
    }

    public get isPureBlack(): boolean {
        // RS stores black as RGB 0,0,1 so transparent can be 0,0,0
        return this.red === 0 && this.green === 0 && this.blue <= 1;
    }
}


export class RGBA extends RGB implements IColor {

    public alpha: number;

    public constructor(argb: number, alpha?: number);
    public constructor(red: number, green: number, blue: number, alpha?: number);
    public constructor(arg0: number, greenOrAlpha?: number, blue?: number, alpha?: number) {
        if(blue === undefined && alpha === undefined) {
            if(arg0 === 0 && greenOrAlpha === undefined) {
                greenOrAlpha = 0; // fully transparent is stored as '0', so set alpha '0'
            } else if(arg0 === 1) { // black is stored as '1'
                // arg0 = 0; // set it back to '0' for proper hue calculations
                greenOrAlpha = 255;
            }

            super(arg0);

            if(greenOrAlpha === undefined) {
                alpha = 255;
            } else {
                alpha = greenOrAlpha;
            }
        } else {
            super(arg0, greenOrAlpha, blue);
        }

        this.alpha = alpha ?? 255;
    }

    public equals(other: RGBA): boolean {
        if(this.red !== other.red) {
            return false;
        }
        if(this.green !== other.green) {
            return false;
        }
        if(this.blue !== other.blue) {
            return false;
        }
        return this.alpha === other.alpha;
    }

    public toDecimals(): RGBValues {
        return {
            r: this.red / 255,
            g: this.green / 255,
            b: this.blue / 255,
            a: this.alpha / 255
        }
    }

    public toString(): string {
        if(this.isTransparent) {
            return `Transparent`;
        }
        return `RGBA ( ${triplePad(this.red)}, ${triplePad(this.green)}, ${triplePad(this.blue)}, ${triplePad(this.alpha)} ) ` +
            `intensity ( ${triplePad(this.intensity)} ) luminance ( ${this.luminance} ) ` +
            `grayscale ( ${triplePad(this.grayscale)} )`;
    }

    public toRgbaInt(): number {
        return (this.red << 24) + (this.green << 16) + (this.blue << 8) + (this.alpha);
    }

    public toArgbInt(): number {
        return (this.alpha << 24) + (this.red << 16) + (this.green << 8) + (this.blue);
    }

    public get isTransparent(): boolean {
        return this.alpha === 0;
    }
}



const rgb255 = (v: number) => (v < 255 ? (v > 0 ? v : 0) : 255);
const b1 = (v: number) => (v > 0.0031308 ? v ** (1 / 2.4) * 269.025 - 14.025 : v * 3294.6);
const b2 = (v: number) => (v > 0.2068965 ? v ** 3 : (v - 4 / 29) * (108 / 841));
const a1 = (v: number) => (v > 10.314724 ? ((v + 14.025) / 269.025) ** 2.4 : v / 3294.6);
const a2 = (v: number) => (v > 0.0088564 ? v ** (1 / 3) : v / (108 / 841) + 4 / 29);

function fromHCL(h: number, c: number, l: number): [ number, number, number ] {
    const y = b2((l = (l + 16) / 116));
    const x = b2(l + (c / 500) * Math.cos((h *= Math.PI / 180)));
    const z = b2(l - (c / 200) * Math.sin(h));
    return [
        rgb255(b1(x * 3.021973625 - y * 1.617392459 - z * 0.404875592)),
        rgb255(b1(x * -0.943766287 + y * 1.916279586 + z * 0.027607165)),
        rgb255(b1(x * 0.069407491 - y * 0.22898585 + z * 1.159737864)),
    ];
}

function toHCL(r: number, g: number, b: number): [ number, number, number ] {
    const y = a2((r = a1(r)) * 0.222488403 + (g = a1(g)) * 0.716873169 + (b = a1(b)) * 0.06060791);
    const l = 500 * (a2(r * 0.452247074 + g * 0.399439023 + b * 0.148375274) - y);
    const q = 200 * (y - a2(r * 0.016863605 + g * 0.117638439 + b * 0.865350722));
    const h = Math.atan2(q, l) * (180 / Math.PI);
    return [h < 0 ? h + 360 : h, Math.sqrt(l * l + q * q), 116 * y - 16];
}
