import { padNumber } from './strings';

export interface RGBValues {
    r: number;
    g: number;
    b: number;
    a?: number;
}

export interface IColor {
    toString(): string;
}

function getHueAndSaturation(rgb: RGB) {
    const { r, g, b } = rgb.toDecimals();

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
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

    return { h, s, max, min, delta, r, g, b };
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

    public constructor(rgb24Integer: number);
    public constructor(rgb: RGB);
    public constructor(hue: number, saturation: number, brightness: number);
    public constructor(arg0: number | RGB, saturation?: number, brightness?: number) {
        let hue = arg0;
        if(saturation === undefined && brightness === undefined) {
            if(typeof arg0 === 'number' && arg0 <= 1) {
                hue = arg0 === 1 ? 0 : -1;
                saturation = arg0 === 1 ? 0 : -1;
                brightness = arg0 === 1 ? 0 : -1;
            } else {
                const { h, s, b } = HSB.fromRgb(typeof arg0 === 'number' ? new RGB(arg0) : arg0);
                hue = h;
                saturation = s;
                brightness = b;
            }
        }

        this.hue = hue as number;
        this.saturation = saturation;
        this.brightness = brightness;
    }

    public static fromRgb(rgb: RGB): { h: number, s: number, b: number } {
        const { h, s, max: v } = getHueAndSaturation(rgb);
        return { h: round(h * 360, 1), s: round(s * 100, 1), b: round(v * 100, 1) };
    }

    public toString(): string {
        if(this.hue < 0) {
            return `HSB ( Transparent )`;
        } else if(this.hue === 0 && this.saturation === 0 && this.brightness === 0) {
            return `HSB ( Black )`;
        }
        return `HSB ( ${triplePad(this.hue, 1)}, ${triplePad(this.saturation, 1)}%, ` +
            `${triplePad(this.brightness, 1)}% ) hueSatDelta ( ${(this.hue - this.saturation).toFixed(1)} )`;
    }

}


export class HSL implements IColor {

    public hue: number;
    public saturation: number;
    public lightness: number;

    public constructor(rgb24Integer: number);
    public constructor(rgb: RGB);
    public constructor(hue: number, saturation: number, lightness: number);
    public constructor(arg0: number | RGB, saturation?: number, lightness?: number) {
        let hue = arg0;
        if(saturation === undefined && lightness === undefined) {
            if(typeof arg0 === 'number' && arg0 <= 1) {
                hue = arg0 === 1 ? 0 : -1;
                saturation = arg0 === 1 ? 0 : -1;
                lightness = arg0 === 1 ? 0 : -1;
            } else {
                const { h, s, l } = HSL.fromRgb(typeof arg0 === 'number' ? new RGB(arg0) : arg0);
                hue = h;
                saturation = s;
                lightness = l;
            }
        }

        this.hue = hue as number;
        this.saturation = saturation;
        this.lightness = lightness;
    }

    public static fromRgb(rgb: RGB): { h: number, s: number, l: number } {
        const { h, s, max, min } = getHueAndSaturation(rgb);
        const l = (max + min) / 2;
        return { h: round(h * 360, 1), s: round(s * 100, 1), l: round(l * 100, 1) };
    }

    public toString(): string {
        if(this.hue < 0) {
            return `HSL ( Transparent )`;
        } else if(this.hue === 0 && this.saturation === 0 && this.lightness === 0) {
            return `HSL ( Black )`;
        }
        return `HSL ( ${triplePad(this.hue, 1)}, ${triplePad(this.saturation, 1)}%, ` +
            `${triplePad(this.lightness, 1)}% ) hueSatDelta ( ${(this.hue - this.saturation).toFixed(1)} )`;
    }

}


export class RGB implements IColor {
    public red: number;
    public green: number;
    public blue: number;

    public constructor(rgb24Integer: number);
    public constructor(red: number, green: number, blue: number);
    public constructor(arg0: number, green?: number, blue?: number) {
        let red = arg0;

        if(green === undefined && blue === undefined) {
            arg0 >>>= 0;
            blue = arg0 & 0xFF;
            green = (arg0 & 0xFF00) >>> 8;
            red = (arg0 & 0xFF0000) >>> 16;
        }

        this.red = red ?? 0;
        this.green = green ?? 0;
        this.blue = blue ?? 0;
    }

    public toDecimals(): RGBValues {
        return {
            r: this.red / 255,
            g: this.green / 255,
            b: this.blue / 255
        }
    }

    public toString(): string {
        if(this.red === 0 && this.green === 0) {
            if(this.blue === 1) {
                return `RGB ( Black )`;
            } else if(this.blue === 0) {
                return `RGB ( Transparent )`;
            }
        }
        return `RGB ( ${triplePad(this.red)}, ${triplePad(this.green)}, ${triplePad(this.blue)} ) ` +
            `intensity ( ${triplePad(this.intensity)} ) luminance ( ${this.luminance} )`;
    }

    public get intensity(): number {
        return Math.round((this.red + this.green + this.blue) / 3);
    }

    public get total(): number {
        return this.green + this.blue + this.red;
    }

    public get luminance(): number {
        return Math.sqrt( .241 * this.red + .691 * this.green + .068 * this.blue);
    }
}


export class RGBA extends RGB implements IColor {

    public alpha: number;

    public constructor(argbInteger: number, alpha?: number);
    public constructor(red: number, green: number, blue: number, alpha?: number);
    public constructor(redOrArgbInteger: number, greenOrAlpha?: number, blue?: number, alpha?: number) {
        if(blue === undefined && alpha === undefined) {
            super(redOrArgbInteger);

            if(greenOrAlpha === undefined) {
                alpha = 255;
            } else {
                alpha = greenOrAlpha;
            }
        } else {
            super(redOrArgbInteger, greenOrAlpha, blue);
        }

        this.alpha = alpha ?? 255;
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
        return `RGBA ( ${triplePad(this.red)}, ${triplePad(this.green)}, ${triplePad(this.blue)}, ${triplePad(this.alpha)} )`;
    }

    public toInt(): number {
        return (this.red << 24) + (this.green << 16) + (this.blue << 8) + (this.alpha);
    }
}
