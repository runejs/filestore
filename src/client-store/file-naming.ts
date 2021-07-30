export const fileNames: { [key: string]: string | null } = require('../../config/name-hashes.json');

export const getFileName = (nameHash: number): string | null => {
    if(nameHash === undefined) {
        return null;
    }
    return fileNames[nameHash.toString()] || nameHash.toString();
};
