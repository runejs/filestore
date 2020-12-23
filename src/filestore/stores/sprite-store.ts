import { ByteBuffer, logger } from '@runejs/core';
import { Filestore, getFileName } from '../filestore';
import { hash } from '../util/name-hash';
import { existsSync, mkdirSync, rmdirSync, writeFileSync } from 'fs';
import { PNG } from 'pngjs';


function toRgba(num: number): number[] {
    num >>>= 0;
    const b = num & 0xFF,
        g = (num & 0xFF00) >>> 8,
        r = (num & 0xFF0000) >>> 16,
        a = ( (num & 0xFF000000) >>> 24 ) / 255;
    return [ r, g, b, a ];
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
        this.maxWidth = width;
        this.maxHeight = height;
    }

    /**
     * Sets the sprite's size to it's maximum size.
     */
    public autoSize(): Sprite {
        this.width = this.maxWidth;
        this.height = this.maxHeight;
        return this;
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
                const [ r, g, b ] = toRgba(pixel);
                const pngIndex = (this.width * y + x) << 2;

                png.data[pngIndex] = r;
                png.data[pngIndex + 1] = g;
                png.data[pngIndex + 2] = b;

                png.data[pngIndex + 3] = pixel >> 24;
            }
        }

        return png;
    }

}


/**
 * A package of one or many Sprite objects.
 */
export class SpritePack {

    public readonly packId: number;
    public readonly nameHash: number;
    public readonly fileBuffer: ByteBuffer;
    private _sprites: Sprite[];

    public constructor(packId: number, buffer: ByteBuffer, nameHash: number) {
        this.packId = packId;
        this.nameHash = nameHash;
        this.fileBuffer = buffer;
    }

    public async writeToDisk(): Promise<void> {
        return new Promise((resolve, reject) => {
            try {
                const fileName = getFileName(this.nameHash).replace(/ /g, '_');

                if(!existsSync('./unpacked/sprite-packs')) {
                    mkdirSync('./unpacked/sprite-packs');
                }

                if(this._sprites.length > 1) {
                    if(!existsSync(`./unpacked/sprite-packs/${this.packId}_${fileName}`)) {
                        mkdirSync((`./unpacked/sprite-packs/${this.packId}_${fileName}`));
                    }

                    let spriteIndex: number = 0;
                    for(const sprite of this._sprites) {
                        if(!sprite) {
                            spriteIndex++;
                            return;
                        }

                        const png = sprite.toPng();
                        png.pack();

                        const pngBuffer = PNG.sync.write(png);
                        writeFileSync(`./unpacked/sprite-packs/${this.packId}_${fileName}/${spriteIndex++}.png`, pngBuffer);
                    }
                } else if(this._sprites.length === 1) {
                    const sprite = this._sprites[0];
                    if(!sprite) {
                        reject(`No sprite data found.`);
                    } else {
                        const png = sprite.toPng();
                        png.pack();

                        const pngBuffer = PNG.sync.write(png);

                        writeFileSync(`./unpacked/sprite-packs/${this.packId}_${fileName}.png`, pngBuffer);
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
        const buffer = this.fileBuffer;

        if(buffer.length === 0) {
            throw new Error(`Empty file content for Sprite Pack ${this.packId}.`);
        } else {
            buffer.readerIndex = (buffer.length - 2);
            const spriteCount = buffer.get('SHORT', 'UNSIGNED');
            const sprites: Sprite[] = new Array(spriteCount);

            buffer.readerIndex = (buffer.length - 7 - spriteCount * 8);
            const width = buffer.get('SHORT', 'UNSIGNED');
            const height = buffer.get('SHORT', 'UNSIGNED');
            const paletteLength = buffer.get('BYTE', 'UNSIGNED') + 1;

            for(let i = 0; i < spriteCount; i++) {
                sprites[i] = new Sprite(i, width, height);
            }

            for(let i = 0; i < spriteCount; i++) {
                sprites[i].offsetX = buffer.get('SHORT', 'UNSIGNED');
            }
            for(let i = 0; i < spriteCount; i++) {
                sprites[i].offsetY = buffer.get('SHORT', 'UNSIGNED');
            }
            for(let i = 0; i < spriteCount; i++) {
                sprites[i].width = buffer.get('SHORT', 'UNSIGNED');
            }
            for(let i = 0; i < spriteCount; i++) {
                sprites[i].height = buffer.get('SHORT', 'UNSIGNED');
            }

            buffer.readerIndex = (buffer.length - 7 - spriteCount * 8 - (paletteLength - 1) * 3);
            const palette: number[] = new Array(paletteLength);

            for(let i = 1; i < paletteLength; i++) {
                palette[i] = buffer.get('INT24');

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
}


/**
 * Controls SpritePack file storage.
 */
export class SpriteStore {

    private readonly fileStore: Filestore;

    public constructor(fileStore: Filestore) {
        this.fileStore = fileStore;
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

        const spritePackIndex = this.fileStore.getIndex('sprites');
        const fileData = spritePackIndex.getFile(nameOrId) || null;
        return fileData ? new SpritePack(fileData.fileId, fileData.content, fileData.nameHash) : null;
    }

    /**
     * Decodes all sprite packs within the filestore.
     * @returns The list of decoded SpritePack objects from the sprite store.
     */
    public decodeSpriteStore(): SpritePack[] {
        const spritePackIndex = this.fileStore.getIndex('sprites');
        const packCount = spritePackIndex.files.size;
        const spritePacks: SpritePack[] = new Array(packCount);

        for(let spritePackId = 0; spritePackId < packCount; spritePackId++) {
            const fileData = spritePackIndex.getFile(spritePackId);
            if(!fileData) {
                spritePacks[spritePackId] = null;
                logger.warn(`No file found for sprite pack ID ${spritePackId}.`);
                continue;
            }

            const spritePack = new SpritePack(spritePackId, fileData.content, fileData.nameHash);
            spritePack.decode();
            spritePacks[spritePackId] = spritePack;
        }

        return spritePacks;
    }

}
