import { Filestore } from '../filestore';
import { SpritePack, SpriteStore, Sprite, toRgb } from './sprite-store';
import { logger } from '@runejs/core';
import { createCanvas, createImageData } from 'canvas';


export const fontNames = [
    'p11_full', 'p12_full', 'b12_full', 'q8_full'
];


export class Font {

    public readonly spritePack: SpritePack;

    public constructor(public readonly name: string,
                       private readonly spriteStore: SpriteStore) {
        this.spritePack = this.spriteStore.getSpritePack(this.name);
        this.spritePack?.decode();
    }

    public drawString(string: string, color: number = 0xffffff): string | null {
        const stringWidth = this.getStringWidth(string);
        const stringHeight = this.getStringHeight(string);
        const characters = string.split('');
        const characterImages: ImageData[] = characters.map(character =>
            createImageData(this.getCharPixels(character, color),
            this.getCharWidth(character), this.getCharHeight(character)));

        const canvas = createCanvas(stringWidth, stringHeight);
        const context = canvas.getContext('2d');

        let x: number = 0;
        for(const img of characterImages) {
            const height = img.height;
            const diff = stringHeight - height;
            context.putImageData(img, x, diff);
            x += img.width;
        }

        return canvas.toDataURL('image/png');
    }

    public getCharPixels(char: string | number, color: number = 0xffffff): Uint8ClampedArray | null {
        const sprite = this.getSprite(char);
        if(!sprite) {
            return null;
        }

        const pixels = sprite.getPixels();

        for(let x = 0; x < sprite.width; x++) {
            for(let y = 0; y < sprite.height; y++) {
                const i = (sprite.width * y + x) << 2;

                if(pixels[i] !== 0) {
                    const [ r, g, b ] = toRgb(color);

                    pixels[i] = r;
                    pixels[i + 1] = g;
                    pixels[i + 2] = b;
                    pixels[i + 3] = 255;
                } else {
                    pixels[i] = 0;
                    pixels[i + 1] = 0;
                    pixels[i + 2] = 0;
                    pixels[i + 3] = 0;
                }
            }
        }

        return pixels;
    }

    public getStringWidth(string: string): number {
        const widths = string.split('').map(stringChar => this.getCharWidth(stringChar));
        return widths.reduce((a, b) => a + b, 0);
    }

    public getStringHeight(string: string): number {
        const heights = string.split('').map(stringChar => this.getCharHeight(stringChar));
        return Math.max(...heights);
    }

    public getCharHeight(char: string | number): number {
        return this.getSprite(char)?.height || 0;
    }

    public getCharWidth(char: string | number): number {
        return this.getSprite(char)?.width || 0;
    }

    public getSprite(char: string | number): Sprite | null {
        if(typeof char === 'string') {
            char = char.charCodeAt(0);
        }

        try {
            return this.spritePack.sprites[char] || null;
        } catch(error) {
            logger.error(`Error loading glyph ${char}`, error);
            return null;
        }
    }

}


export class FontStore {

    public readonly fonts: { [key: string]: Font } = {};

    public constructor(private readonly filestore: Filestore) {
    }

    public loadFonts(): FontStore {
        for(const fontName of fontNames) {
            this.fonts[fontName] = new Font(fontName, this.filestore.spriteStore);
        }

        return this;
    }

}
