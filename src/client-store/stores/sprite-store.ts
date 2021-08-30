import { logger } from '@runejs/core';
import { existsSync, mkdirSync, rmdirSync, writeFileSync } from 'fs';
import { PNG } from 'pngjs';

import { ClientFileStore} from '../client-file-store';
import { ClientFile } from '../client-file';
import { getFileName } from '../file-naming';
import { Store } from './store';


export function toRgb(color: number): [ number, number, number ] {
    color >>>= 0;
    const b = color & 0xFF,
        g = (color & 0xFF00) >>> 8,
        r = (color & 0xFF0000) >>> 16;
    return [ r, g, b ];
}

/**
 * A single Sprite within a SpritePack.
 */
export class Sprite {

    spriteId: number;
    maxWidth: number;
    maxHeight: number;
    offsetX: number;
    offsetY: number;
    width: number;
    height: number;
    pixelIdx: number[];
    palette: number[];
    pixels: number[];

    public constructor(spriteId: number, width: number, height: number) {
        this.spriteId = spriteId;
        this.maxWidth = this.width = width;
        this.maxHeight = this.height = height;
    }

    public resizeToLibSize() {
        if (this.width != this.maxWidth || this.height != this.maxHeight) {
            const resizedPixels = new Array(this.maxWidth * this.maxHeight);
            let pixelCount = 0;
            for (let y = 0; y < this.height; y++) {
                for (let x = 0; x < this.width; x++) {
                    resizedPixels[x + this.offsetX + (y + this.offsetY) * this.maxWidth] = this.pixelIdx[pixelCount++];
                }
            }
            this.pixelIdx = resizedPixels;
            this.width = this.maxWidth;
            this.height = this.maxHeight;
            this.offsetX = 0;
            this.offsetY = 0;
        }
    }

    /**
     * First converts the Sprite into a base64 PNG image.
     */
    public async toBase64(): Promise<string> {
        return new Promise(async (resolve, reject) => {
            const png = this.toPng();

            try {
                png.pack();

                const chunks = [];

                png.on('data', (chunk) => {
                    chunks.push(chunk);
                });
                png.on('end', () => {
                    const str = Buffer.concat(chunks).toString('base64');
                    resolve(str);
                });
            } catch(error) {
                reject(error);
            }
        });
    }

    /**
     * Converts the Sprite into a PNG image and returns the resulting PNG object.
     */
    public toPng(): PNG {
        const png = new PNG({
            width: this.width,
            height: this.height,
            filterType: -1
        });

        for(let x = 0; x < this.width; x++) {
            for(let y = 0; y < this.height; y++) {
                const pixel = this.pixels[this.width * y + x];
                const [ r, g, b ] = toRgb(pixel);
                const pngIndex = (this.width * y + x) << 2;

                png.data[pngIndex] = r;
                png.data[pngIndex + 1] = g;
                png.data[pngIndex + 2] = b;
                png.data[pngIndex + 3] = pixel >> 24;
            }
        }

        return png;
    }

    /**
     * Converts the Sprite's pixels into a Uint8ClampedArray.
     */
    public getPixels(): Uint8ClampedArray {
        return new Uint8ClampedArray(this.toPng().data);
    }

}


/**
 * A package of one or many Sprite objects.
 */
export class SpritePack {

    private _sprites: Sprite[];

    public constructor(public readonly fileData: ClientFile) {
    }

    public async writeToDisk(): Promise<void> {
        return new Promise((resolve, reject) => {
            try {
                const fileName = getFileName(this.fileData.nameHash).replace(/ /g, '_');

                if(!existsSync('./unpacked/sprite-packs')) {
                    mkdirSync('./unpacked/sprite-packs');
                }

                if(this._sprites.length > 1) {
                    if(!existsSync(`./unpacked/sprite-packs/${this.fileData.fileIndex}_${fileName}`)) {
                        mkdirSync((`./unpacked/sprite-packs/${this.fileData.fileIndex}_${fileName}`));
                    }

                    for(let i = 0; i < this._sprites.length; i++) {
                        try {
                            const sprite = this._sprites[i];

                            let png: PNG;
                            if(!sprite) {
                                png = new PNG({
                                    width: 1,
                                    height: 1,
                                    fill: false,
                                    bgColor: {
                                        red: 0,
                                        green: 0,
                                        blue: 0
                                    }
                                });
                            } else {
                                png = sprite.toPng();
                            }

                            png.pack();

                            const pngBuffer = PNG.sync.write(png);
                            writeFileSync(`./unpacked/sprite-packs/${ this.fileData.fileIndex }_${ fileName }/${ i }.png`, pngBuffer);
                        } catch(e) {
                            logger.error(`Error writing sprite to disk`, e);
                        }
                    }
                } else if(this._sprites.length === 1) {
                    const sprite = this._sprites[0];
                    if(!sprite) {
                        reject(`No sprite data found.`);
                    } else {
                        const png = sprite.toPng();
                        png.pack();

                        const pngBuffer = PNG.sync.write(png);

                        writeFileSync(`./unpacked/sprite-packs/${this.fileData.fileIndex}_${fileName}.png`, pngBuffer);
                    }
                }
                resolve();
            } catch(error) {
                reject(error);
            }
        });
    }

    /**
     * Decodes the sprite pack file.
     */
    public decode(): SpritePack {
        const buffer = this.fileData.decompress();

        if(buffer.length === 0) {
            throw new Error(`Empty file content for Sprite Pack ${this.fileData.fileIndex}.`);
        } else {
            buffer.readerIndex = (buffer.length - 2);
            const spriteCount = buffer.get('short', 'unsigned');
            const sprites: Sprite[] = new Array(spriteCount);

            buffer.readerIndex = (buffer.length - 7 - spriteCount * 8);
            const overallWidth = buffer.get('short', 'unsigned');
            const overallHeight = buffer.get('short', 'unsigned');
            const paletteLength = buffer.get('byte', 'unsigned') + 1;

            for(let i = 0; i < spriteCount; i++) {
                sprites[i] = new Sprite(i, overallWidth, overallHeight);
            }

            for(let i = 0; i < spriteCount; i++) {
                sprites[i].offsetX = buffer.get('short', 'unsigned');
            }
            for(let i = 0; i < spriteCount; i++) {
                sprites[i].offsetY = buffer.get('short', 'unsigned');
            }
            for(let i = 0; i < spriteCount; i++) {
                sprites[i].width = buffer.get('short', 'unsigned');
            }
            for(let i = 0; i < spriteCount; i++) {
                sprites[i].height = buffer.get('short', 'unsigned');
            }

            buffer.readerIndex = (buffer.length - 7 - spriteCount * 8 - (paletteLength - 1) * 3);
            const palette: number[] = new Array(paletteLength);

            for(let i = 1; i < paletteLength; i++) {
                palette[i] = buffer.get('int24');

                if(palette[i] === 0) {
                    palette[i] = 1;
                }
            }

            buffer.readerIndex = 0;

            for(let i = 0; i < spriteCount; i++) {
                const sprite = sprites[i];
                const spriteWidth = sprite.width;
                const spriteHeight = sprite.height;
                const dimension = spriteWidth * spriteHeight;
                const pixelPaletteIndicies: number[] = new Array(dimension);
                const pixelAlphas: number[] = new Array(dimension);
                sprite.palette = palette;

                const flags = buffer.get('BYTE', 'UNSIGNED');

                if((flags & 0b01) === 0) {
                    for(let j = 0; j < dimension; j++) {
                        pixelPaletteIndicies[j] = buffer.get('BYTE');
                    }
                } else {
                    for(let x = 0; x < spriteWidth; x++) {
                        for(let y = 0; y < spriteHeight; y++) {
                            pixelPaletteIndicies[spriteWidth * y + x] = buffer.get('BYTE');
                        }
                    }
                }

                if((flags & 0b10) === 0) {
                    for(let j = 0; j < dimension; j++) {
                        const index = pixelPaletteIndicies[j];
                        if(index !== 0) {
                            pixelAlphas[j] = 0xff;
                        }
                    }
                } else {
                    if((flags & 0b01) === 0) {
                        for(let j = 0; j < dimension; j++) {
                            pixelAlphas[j] = buffer.get('BYTE');
                        }
                    } else {
                        for(let x = 0; x < spriteWidth; x++) {
                            for(let y = 0; y < spriteHeight; y++) {
                                pixelAlphas[spriteWidth * y + x] = buffer.get('BYTE');
                            }
                        }
                    }
                }

                sprite.pixelIdx = pixelPaletteIndicies;
                sprite.pixels = new Array(dimension);

                for(let j = 0; j < dimension; j++) {
                    const index = pixelPaletteIndicies[j] & 0xff;
                    sprite.pixels[j] = palette[index] | (pixelAlphas[j] << 24);
                }
            }

            this._sprites = sprites;
        }

        return this;
    }

    public get sprites(): Sprite[] {
        return this._sprites;
    }

    public get packId(): number {
        return this.fileData?.fileIndex || -1;
    }
}


/**
 * Controls SpritePack file storage.
 */
export class SpriteStore extends Store {

    public constructor(fileStore: ClientFileStore) {
        super(fileStore, 'sprites');
    }

    public async writeToDisk(): Promise<void> {
        rmdirSync('./unpacked/sprite-packs', { recursive: true });
        const spritePacks = this.decodeSpriteStore();
        for(const spritePack of spritePacks) {
            try {
                await spritePack.writeToDisk();
            } catch(e) {
                logger.error(`Error writing spritepack ${spritePack.packId} to disk.`);
                logger.error(e);
            }
        }
    }

    /**
     * Decodes the specified sprite pack.
     * @param fileName The name of the sprite pack file.
     * @returns The decoded SpritePack object, or null if the file is not found.
     */
    public getSpritePack(fileName: string): SpritePack | null;

    /**
     * Decodes the specified sprite pack.
     * @param id The ID of the sprite pack file.
     * @returns The decoded SpritePack object, or null if the file is not found.
     */
    public getSpritePack(id: number): SpritePack | null;

    /**
     * Decodes the specified sprite pack.
     * @param nameOrId The name or ID of the sprite pack file.
     * @returns The decoded SpritePack object, or null if the file is not found.
     */
    public getSpritePack(nameOrId: string | number): SpritePack | null {
        if(!nameOrId) {
            return null;
        }

        const spritePackIndex = this.fileStore.getArchive('sprites');
        const fileData = spritePackIndex.getFile(nameOrId) || null;
        return fileData ? new SpritePack(fileData) : null;
    }

    /**
     * Decodes all sprite packs within the filestore.
     * @returns The list of decoded SpritePack objects from the sprite store.
     */
    public decodeSpriteStore(): SpritePack[] {
        const spritePackIndex = this.fileStore.getArchive('sprites');
        const packCount = spritePackIndex.groups.size;
        const spritePacks: SpritePack[] = new Array(packCount);

        for(let spritePackId = 0; spritePackId < packCount; spritePackId++) {
            const fileData = spritePackIndex.getFile(spritePackId);
            if(!fileData) {
                spritePacks[spritePackId] = null;
                logger.warn(`No file found for sprite pack ID ${spritePackId}.`);
                continue;
            }

            const spritePack = new SpritePack(fileData);
            spritePack.decode();
            spritePacks[spritePackId] = spritePack;
        }

        return spritePacks;
    }

}
