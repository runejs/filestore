
export interface RGBValues {
    r: number;
    g: number;
    b: number;
}

export interface RGBAValues extends RGBValues {
    a: number;
}

function decodeRgbInteger(rgbInteger: number): RGBValues {
    rgbInteger >>>= 0;
    const b = rgbInteger & 0xFF,
        g = (rgbInteger & 0xFF00) >>> 8,
        r = (rgbInteger & 0xFF0000) >>> 16;

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

    public constructor(hue: number, saturation: number, brightness: number) {
        super(hue, saturation);
        this.brightness = brightness;
    }

    public static fromRgbInt(rgbInteger: number): HSB {
        const { r, g, b } = RGB.fromRgbInt(rgbInteger).toDecimals();

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

        return new HSB(hue, saturation, brightness);
    }
}


export class HSL extends HS {
    public lightness: number;

    public constructor(hue: number, saturation: number, lightness: number) {
        super(hue, saturation);
        this.lightness = lightness;
    }

    public static fromRgbInt(rgbInteger: number): HSL {
        const { r, g, b } = RGB.fromRgbInt(rgbInteger).toDecimals();

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

        return new HSL(hue, saturation, lightness);
    }
}


export class RGB {
    public red: number;
    public green: number;
    public blue: number;

    public constructor(red: number, green: number, blue: number) {
        this.red = red;
        this.green = green;
        this.blue = blue;
    }

    public static fromRgbInt(rgbInteger: number): RGB {
        const { r, g, b } = decodeRgbInteger(rgbInteger);
        return new RGB(r, g, b);
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
        //return 0.21 * this.red + 0.72 * this.green + 0.07 * this.blue;
    }
}


export class RGBA extends RGB {

    public alpha: number;

    public constructor(red: number, green: number, blue: number, alpha: number) {
        super(red, green, blue);
        this.alpha = alpha;
    }

    public static fromRgbInt(rgbInteger: number, alpha: number = 255): RGBA {
        const { r, g, b } = decodeRgbInteger(rgbInteger);
        return new RGBA(r, g, b, alpha);
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


export class ColorUsage {

    public rgb: number;
    public rangeCount: number = 1;
    public totalUses: number = 1;

    public constructor(rgb: number, totalUses: number) {
        this.rgb = rgb;
        this.totalUses = totalUses;
    }

    public get average(): number {
        return (this.totalUses || 1) / (this.rangeCount || 1);
    }

}


export type PaletteUsageMap = { [key: number]: ColorUsage };


export const paletteBuilder = (ranges: { rgb: number, pixels: number }[],
                               palette: number[]): number[] => {
    const usageMap: PaletteUsageMap = {};

    let usesBlack: boolean = false;

    for(const range of ranges) {
        if(range.rgb === 0) {
            continue;
        }
        if(range.rgb === 1) {
            usesBlack = true;
            // continue;
        }

        const intensity = RGB.fromRgbInt(range.rgb).intensity;
        const colorUsage = usageMap[intensity];

        if(!colorUsage) {
            palette.push(range.rgb);
            usageMap[intensity] = new ColorUsage(range.rgb, range.pixels);
        } else {
            colorUsage.rangeCount++;
            colorUsage.totalUses += range.pixels;
        }
    }

    const nodes = Object.keys(usageMap);
    const nodeCount = nodes.length;

    palette.sort((firstRgb, secondRgb) => {
        const usageA = usageMap[firstRgb];
        const usageB = usageMap[secondRgb];

        return usageB.rangeCount - usageA.rangeCount;

        /*const a = RGB.fromRgbInt(firstRgb);
        const b = RGB.fromRgbInt(secondRgb);

        const result = a.value - b.value;

        if(result === 0) {
            console.log(`equal ${a} = ${b}`);
            return -1;
        } else {
            console.log(result);
        }

        return result;*/
        // return firstRgb - secondRgb;
        /*const a = HSB.fromRgbInt(firstRgb);
        const b = HSB.fromRgbInt(secondRgb);

        const similarHue = Math.floor(a.hue / 16) === Math.floor(b.hue / 16);

        if(!similarHue) {
            if(a.hue < b.hue) {
                return -1;
            }
            if(a.hue > b.hue) {
                return 1;
            }
        }
        if(a.saturation < b.saturation) {
            return 1;
        }
        if(a.saturation > b.saturation) {
            return -1;
        }
        if(a.brightness < b.brightness) {
            return -1;
        }
        if(a.brightness > b.brightness) {
            return 1;
        }
        return 0;*/

        /*if(hsb1[0] === hsb2[0]) {
            if(hsb1[1] === hsb2[1]) {
                return hsb2[2] - hsb1[2];
            } else {
                return hsb1[1] - hsb2[1];
            }
        }

        return hsb1[0] - hsb2[0];*/
    });//.reverse();

    if(usesBlack) {
        // palette.unshift(1);
    }
    palette.unshift(0);

    return palette;
};
