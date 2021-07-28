export const argbToRgba = (rgb: number, alpha: number): number => {
    rgb >>>= 0;
    const b = rgb & 0xFF,
        g = (rgb & 0xFF00) >>> 8,
        r = (rgb & 0xFF0000) >>> 16;

    return (r << 24) + (g << 16) + (b << 8) + (alpha);
};
