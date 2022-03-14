export const archiveFlags = (flags: number) => ({
    groupNames: (flags & 0x01) !== 0,
    whirlpoolDigests: (flags & 0x02) !== 0,
    groupSizes: (flags & 0x04) !== 0,
    decompressedCrcs: (flags & 0x08) !== 0,
});
