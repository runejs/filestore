
export interface RGBValues {
    r: number;
    g: number;
    b: number;
}

export interface RGBAValues extends RGBValues {
    a: number;
}

function decodeRgbInt24(rgb24: number): RGBValues {
    rgb24 >>>= 0;
    const b = rgb24 & 0xFF,
        g = (rgb24 & 0xFF00) >>> 8,
        r = (rgb24 & 0xFF0000) >>> 16;

    return { r, g, b };
}


abstract class HS {
    public hue: number;
    public saturation: number;

    protected constructor(hue: number, saturation: number) {
        this.hue = hue;
        this.saturation = saturation;
    }
}


export class HSB extends HS {
    public brightness: number;

    public constructor(argbInteger: number);
    public constructor(hue: number, saturation: number, brightness: number);
    public constructor(hueOrArgb: number, saturation?: number, brightness?: number) {
        if(saturation === undefined && brightness === undefined) {
            const { h, s, b } = HSB.fromRgb(new RGB(hueOrArgb));
            hueOrArgb = h;
            saturation = s;
            brightness = b;
        }
        super(hueOrArgb, saturation);
        this.brightness = brightness;
    }

    public static fromRgb(rgb: RGB): { h: number, s: number, b: number } {
        const { r, g, b } = rgb.toDecimals();

        const rgbMin = Math.min(r, g, b);
        const rgbMax = Math.max(r, g, b);
        const rgbDelta = rgbMax - rgbMin;

        let hue = 0;
        let saturation = (rgbMax === 0 ? 0 : rgbDelta / rgbMax);
        const brightness = rgbMax / 255;

        switch(rgbMax) {
            case rgbMin:
                hue = 0;
                break;
            case r:
                hue = (g - b) + rgbDelta * (g < b ? 6 : 0);
                hue /= 6 * rgbDelta;
                break;
            case g:
                hue = (b - r) + rgbDelta * 2;
                hue /= 6 * rgbDelta;
                break;
            case b:
                hue = (r - g) + rgbDelta * 4;
                hue /= 6 * rgbDelta;
                break;
        }

        return { h: hue, s: saturation, b: brightness };
    }
}


export class HSL extends HS {
    public lightness: number;

    public constructor(argbInteger: number);
    public constructor(hue: number, saturation: number, lightness: number);
    public constructor(hueOrArgb: number, saturation?: number, lightness?: number) {
        if(saturation === undefined && lightness === undefined) {
            const { h, s, l } = HSL.fromRgb(new RGB(hueOrArgb));
            hueOrArgb = h;
            saturation = s;
            lightness = l;
        }
        super(hueOrArgb, saturation);
        this.lightness = lightness;
    }

    public static fromRgb(rgb: RGB): { h: number, s: number, l: number } {
        const { r, g, b } = rgb.toDecimals();

        const rgbMin = Math.min(r, g, b);
        const rgbMax = Math.max(r, g, b);
        const rgbDelta = rgbMax - rgbMin;

        let hue = 0;
        let saturation = 0;
        const lightness = (rgbMax + rgbMin) / 2;

        if(rgbDelta === 0 || lightness === 0) {
            saturation = 0;
        } else if(lightness === 1) {
            saturation = 1;
        } else if(lightness <= 0.5) {
            saturation = rgbDelta / (2 * (1 - lightness));
        } else if(lightness > 0.5) {
            saturation = rgbDelta / (2 * lightness);
        }

        if(rgbDelta === 0) {
            hue = 0;
        } else if(rgbMax === r && g >= b) {
            hue = 60 * (g - b) / rgbDelta;
        } else if(rgbMax === r && g < b) {
            hue = 60 * (g - b) / rgbDelta + 360;
        } else if(rgbMax === g) {
            hue = 60 * (b - r) / rgbDelta + 120;
        } else if(rgbMax === b) {
            hue = 60 * (r - g) / rgbDelta + 240;
        }

        return { h: hue, s: saturation, l: lightness };
    }
}


export class RGB {
    public red: number;
    public green: number;
    public blue: number;

    public constructor(argbInteger: number);
    public constructor(red: number, green: number, blue: number);
    public constructor(redOrArgbInteger: number, green?: number, blue?: number) {
        let red = redOrArgbInteger;

        if(green === undefined && blue === undefined) {
            const { r, g, b } = decodeRgbInt24(redOrArgbInteger);
            red = r;
            green = g;
            blue = b;
        }

        this.red = red;
        this.green = green;
        this.blue = blue;
    }

    public toDecimals(): RGBValues {
        return {
            r: this.red / 255,
            g: this.green / 255,
            b: this.blue / 255
        }
    }

    public toString(): string {
        return `[${this.red}, ${this.green}, ${this.blue}]`;
    }

    public get intensity(): number {
        return Math.round((this.red + this.green + this.blue) / 3);
    }
}


export class RGBA extends RGB {

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

    public toDecimals(): RGBAValues {
        return {
            r: this.red / 255,
            g: this.green / 255,
            b: this.blue / 255,
            a: this.alpha / 255
        }
    }

    public toInt(): number {
        return (this.red << 24) + (this.green << 16) + (this.blue << 8) + (this.alpha);
    }
}
