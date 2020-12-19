import { ByteBuffer } from '@runejs/core';
import { Filestore } from '../filestore';
import { hash } from '../util/name-hash';


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

    public autoSize(): Sprite {
        this.width = this.maxWidth;
        this.height = this.maxHeight;
        return this;
    }

}

export class SpritePack {

    public readonly nameHash: number;
    public readonly archive: ByteBuffer;
    public readonly packId: number;
    private _sprites: Sprite[];

    public constructor(nameHash: number, buffer: ByteBuffer, packId: number) {
        this.nameHash = nameHash;
        this.archive = buffer;
        this.packId = packId;
    }

    public decode(): void {
        const buffer = this.archive;

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
    }

    public get sprites(): Sprite[] {
        return this._sprites;
    }
}


export class SpriteStore {

    public spritePacks: SpritePack[] = [];
    private readonly fileStore: Filestore;

    public constructor(fileStore: Filestore) {
        this.fileStore = fileStore;
    }

    public getPack(name: string): SpritePack {
        const nameHash = hash(name);
        for(const pack of this.spritePacks) {
            if(nameHash === pack.nameHash) {
                return pack;
            }
        }
        return null;
    }

    public decodeSpritePacks(): SpritePack[] {
        const spritePackIndex = this.fileStore.getIndex('sprites');
        const packCount = spritePackIndex.archives.size;
        const spritePacks: SpritePack[] = [];

        for(let spritePackId = 0; spritePackId < packCount; spritePackId++) {
            const archive = spritePackIndex.getArchive(spritePackId, false);
            if(!archive) {
                console.log(`No archive found for sprite pack ${spritePackId}`);
                continue;
            }

            const spritePack = new SpritePack(archive.nameHash, archive.content, spritePackId);
            spritePack.decode();
            spritePacks.push(spritePack);
        }

        this.spritePacks = spritePacks;
        return spritePacks;
    }

}
