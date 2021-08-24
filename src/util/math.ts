export const toDegrees = (radians: number): number => {
    return radians * 180 / Math.PI;
};

export const toRadians = (degrees: number): number => {
    return degrees * Math.PI / 180;
};
