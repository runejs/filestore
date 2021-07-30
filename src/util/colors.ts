export const argbToRgba = (rgb: number, alpha: number): number => {
    rgb >>>= 0;
    const b = rgb & 0xFF,
        g = (rgb & 0xFF00) >>> 8,
        r = (rgb & 0xFF0000) >>> 16;

    return (r << 24) + (g << 16) + (b << 8) + (alpha);
};

export const rgbaToArgb = (rgba: number): [ number, number ] => {
    const r = ((rgba >> 16) & 0xff) / 255;
    const g = ((rgba >>  8) & 0xff) / 255;
    const b = ((rgba      ) & 0xff) / 255;
    const a = ((rgba >> 24) & 0xff) / 255;

    const color: number = ((r & 0xff) << 16) | ((g & 0xff) << 8) | (b & 0xff);
    return [ color, a ];
};
