export const fileNames: { [key: string]: string | null } = require('../../config/name-hashes.json'); // @TODO configurable

export const getFileName = (nameHash: number): string | null => {
    if(nameHash === undefined) {
        return null;
    }
    return fileNames[nameHash.toString()] || nameHash.toString();
};
