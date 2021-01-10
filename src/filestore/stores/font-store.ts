import { Filestore } from '../filestore';
import { SpritePack, SpriteStore, Sprite, toRgb } from './sprite-store';
import { logger } from '@runejs/core';
import { createCanvas, createImageData } from 'canvas';


/**
 * A list of game font file names.
 */
export const fontNames = [
    'p11_full', 'p12_full', 'b12_full', 'q8_full'
];


export class Font {

    /**
     * The `SpritePack` containing this `Font`'s various character glypth.
     */
    public readonly spritePack: SpritePack;

    public constructor(public readonly name: string,
                       private readonly spriteStore: SpriteStore) {
        this.spritePack = this.spriteStore.getSpritePack(this.name);
        this.spritePack?.decode();
    }

    /**
     * Draws the given string and returns it as a base64 encoded PNG image string.
     * @param string The string to draw.
     * @param textColor The color to draw the text in.
     * @returns A base64 encoded PNG image.
     */
    public drawString(string: string, textColor: number = 0xffffff): string {
        const stringWidth = this.getStringWidth(string);
        const stringHeight = this.getStringHeight(string);
        const characters = string.split('');
        const characterImages: ImageData[] = characters.map(character =>
            createImageData(this.getCharPixels(character, textColor),
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

    /**
     * Fetches all of the pixels of a character glyph in `Uint8ClampedArray` rgba pixel format.
     * @param char The character or character code to get the pixels of.
     * @param color The color to set the character's pixels to. Defaults to white.
     */
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

    /**
     * Finds and returns the height of the tallest character glyph within the specified string.
     * @param string The string to find the height of.
     */
    public getStringHeight(string: string): number {
        const heights = string.split('').map(stringChar => this.getCharHeight(stringChar));
        return Math.max(...heights);
    }

    /**
     * Calculates the total width of all character glyphs within the specified string.
     * @param string The string to find the width of.
     */
    public getStringWidth(string: string): number {
        const widths = string.split('').map(stringChar => this.getCharWidth(stringChar));
        return widths.reduce((a, b) => a + b, 0);
    }

    /**
     * Gets the glyph height for the specified character or character code.
     * @param char The character or character code to get the height of.
     */
    public getCharHeight(char: string | number): number {
        return this.getSprite(char)?.height || 0;
    }

    /**
     * Gets the glyph width for the specified character or character code.
     * @param char The character or character code to get the width of.
     */
    public getCharWidth(char: string | number): number {
        return this.getSprite(char)?.width || 0;
    }

    /**
     * Gets the `Sprite` for the specified character or character code.
     * @param char The character or character code to get the sprite glyph for.
     */
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


/**
 * Contains information and tools for the game's fonts.
 */
export class FontStore {

    /**
     * A map of loaded game fonts by name.
     */
    public readonly fonts: { [key: string]: Font } = {};

    public constructor(private readonly filestore: Filestore) {
    }

    /**
     * Load the list of registered game fonts and their associated Sprite Packs.
     */
    public loadFonts(): FontStore {
        for(const fontName of fontNames) {
            this.fonts[fontName] = new Font(fontName, this.filestore.spriteStore);
        }

        return this;
    }

}
