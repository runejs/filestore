export class ModelColor {

    private static readonly UNKNOWN_COLOR_TABLE = ModelColor.initUnknownColorTable();
    private static readonly HSB_TO_RGB = ModelColor.initHsbToRgb(0.7, 0, 512);

    public static initUnknownColorTable(): Uint32Array {
        const table = new Uint32Array(128);
        let i = 0;
        let i_322_ = 248;
        while(i < 9) {
            table[i++] = 255;
        }
        while(i < 16) {
            table[i++] = i_322_;
            i_322_ -= 8;
        }
        while(i < 32) {
            table[i++] = i_322_;
            i_322_ -= 4;
        }
        while(i < 64) {
            table[i++] = i_322_;
            i_322_ -= 2;
        }
        while(i < 128) {
            table[i++] = i_322_--;
        }
        return table;
    }

    public static initHsbToRgb(arg0: number, arg1: number, arg2: number): Uint32Array {
        const table = new Uint32Array(65536);
        arg0 += Math.random() * 0.03 - 0.015;
        let i = arg1 * 128;
        for(let i_58_ = arg1; i_58_ < arg2; i_58_++) {
            const d = (i_58_ >> 3) / 64.0 + 0.0078125;
            const d_59_ = (i_58_ & 0x7) / 8.0 + 0.0625;
            for(let i_60_ = 0; i_60_ < 128; i_60_++) {
                const d_61_ = i_60_ / 128.0;
                let red = d_61_;
                let green = d_61_;
                let blue = d_61_;
                if(d_59_ !== 0.0) {
                    let d_65_;
                    if(d_61_ < 0.5) {
                        d_65_ = d_61_ * (1.0 + d_59_);
                    } else {
                        d_65_ = d_61_ + d_59_ - d_61_ * d_59_;
                    }
                    const d_66_ = 2.0 * d_61_ - d_65_;
                    let d_67_ = d + 0.3333333333333333;
                    if(d_67_ > 1.0) {
                        d_67_--;
                    }
                    const d_68_ = d;
                    let d_69_ = d - 0.3333333333333333;
                    if(d_69_ < 0.0) {
                        d_69_++;
                    }
                    if(6.0 * d_67_ < 1.0) {
                        red = d_66_ + (d_65_ - d_66_) * 6.0 * d_67_;
                    } else if(2.0 * d_67_ < 1.0) {
                        red = d_65_;
                    } else if(3.0 * d_67_ < 2.0) {
                        red = d_66_ + (d_65_ - d_66_) * (0.6666666666666666 - d_67_) * 6.0;
                    } else {
                        red = d_66_;
                    }
                    if(6.0 * d_68_ < 1.0) {
                        green = d_66_ + (d_65_ - d_66_) * 6.0 * d_68_;
                    } else if(2.0 * d_68_ < 1.0) {
                        green = d_65_;
                    } else if(3.0 * d_68_ < 2.0) {
                        green = d_66_ + (d_65_ - d_66_) * (0.6666666666666666 - d_68_) * 6.0;
                    } else {
                        green = d_66_;
                    }
                    if(6.0 * d_69_ < 1.0) {
                        blue = d_66_ + (d_65_ - d_66_) * 6.0 * d_69_;
                    } else if(2.0 * d_69_ < 1.0) {
                        blue = d_65_;
                    } else if(3.0 * d_69_ < 2.0) {
                        blue = d_66_ + (d_65_ - d_66_) * (0.6666666666666666 - d_69_) * 6.0;
                    } else {
                        blue = d_66_;
                    }
                }
                const redUByte = red * 256.0;
                const greenUByte = green * 256.0;
                const blueUByte = blue * 256.0;
                let rgb = (redUByte << 16) + (greenUByte << 8) + blueUByte;
                rgb = this.method707(rgb, arg0);
                if(rgb == 0) {
                    rgb = 1;
                }
                table[i++] = rgb;
            }
        }
        return table;
    }

    public static hsbToRgb(hsb: number): number {
        return this.HSB_TO_RGB[hsb];
    }

    public static method707(rgb: number, arg1: number) {
        let red = (rgb >> 16) / 256.0;
        let green = (rgb >> 8 & 0xff) / 256.0;
        let blue = (rgb & 0xff) / 256.0;
        red = Math.pow(red, arg1);
        green = Math.pow(green, arg1);
        blue = Math.pow(blue, arg1);
        const newRed = red * 256.0;
        const newGreen = green * 256.0;
        const newBlue = blue * 256.0;
        return (newRed << 16) + (newGreen << 8) + newBlue;
    }

    public static method816(faceColor: number, arg1: number, faceType: number): number {
        if((faceType & 0x2) == 2) {
            if(arg1 < 0) {
                arg1 = 0;
            } else if(arg1 > 127) {
                arg1 = 127;
            }
            arg1 = this.UNKNOWN_COLOR_TABLE[arg1];
            return arg1;
        }
        arg1 = arg1 * (faceColor & 0x7f) >> 7;
        if(arg1 < 2) {
            arg1 = 2;
        } else if(arg1 > 126) {
            arg1 = 126;
        }
        return (faceColor & 0xff80) + arg1;
    }

    public static method709(arg0: number, arg1: number): number {
        arg1 = (127 - arg1) * (arg0 & 0x7f) >> 7;
        if(arg1 < 2) {
            arg1 = 2;
        } else if(arg1 > 126) {
            arg1 = 126;
        }
        return (arg0 & 0xff80) + arg1;
    }

    // custom shade function (not from the client)
    public static shade(rgb: number, shadowRgb: number): number {
        let red = (rgb >> 16) / 256.0;
        let green = (rgb >> 8 & 0xff) / 256.0;
        let blue = (rgb & 0xff) / 256.0;
        const shadowRed = (shadowRgb >> 16 & 0xff) / 255.0;
        const shadowGreen = (shadowRgb >> 8 & 0xff) / 255.0;
        const shadowBlue = (shadowRgb & 0xff) / 255.0;
        red *= 1 - shadowRed;
        green *= 1 - shadowGreen;
        blue *= 1 - shadowBlue;
        const newRed = red * 256.0;
        const newGreen = green * 256.0;
        const newBlue = blue * 256.0;
        return (newRed << 16) + (newGreen << 8) + newBlue;
    }

}
