export const argbToRgba = (argb: number, alpha: number): number => {
    argb >>>= 0;
    const b = argb & 0xFF,
        g = (argb & 0xFF00) >>> 8,
        r = (argb & 0xFF0000) >>> 16;//,
        // a = (argb & 0xFF0000) >>> 24;

    return (r << 24) + (g << 16) + (b << 8) + (alpha);
};

export const rgbaToArgb = (rgba: number): [ number, number ] => {
    const r = ((rgba >> 16) & 0xff) / 255;
    const g = ((rgba >>  8) & 0xff) / 255;
    const b = ((rgba      ) & 0xff) / 255;
    const a = ((rgba >> 24) & 0xff) / 255;



    const color: number = 0xFF000000 | (r << 16) & 0x00FF0000 | (g << 8) & 0x0000FF00 | b & 0x000000FF;
    return [ color, a ];
};
