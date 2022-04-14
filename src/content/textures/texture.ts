export enum TextureSize {
    LOWMEM = 64,
    HIGHMEM = 128
}

export class Texture {

    static TEXTURE_SIZE = TextureSize.HIGHMEM;
    static TEXTURE_INTENSITY = 0.7;
    static pixelsBuffer: number[];

    id: number;
    rgb: number;
    opaque: boolean;
    spriteKeys: number[];
    renderTypes: number[];
    anIntArray2138: number[];
    colors: number[];
    direction: number;
    speed: number;
    pixels: number[] = null;
    size: number;

}
