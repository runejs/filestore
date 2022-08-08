import { logger } from '@runejs/common';
import { NameHasher } from '../config';
import { join } from 'path';


// @todo optimize this thing - 08/08/22 - Kiko
const bruteForcer = async () => {
    const hashes = [
        22834782,
        -1857300557,
    ];

    const validChars = [
        'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I',
        'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R',
        'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z',
        '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
        '_', '-'
    ];

    const validCharCodes = validChars.map(s => s.charCodeAt(0));

    const INT_MAX = 2147483648;

    // Emulate Java's INT overflow-wrapping
    const int32 = (value: number): number => {
        while (value > INT_MAX) {
            const diff = value - INT_MAX;
            value = -INT_MAX + diff;
        }

        while (value < -INT_MAX) {
            const diff = Math.abs(value) - INT_MAX;
            value = INT_MAX - diff;
        }

        return value;
    }

    const addToHash = (s: string, hash: number): number => {
        for (let j = 0; j < s.length; j++) {
            hash = int32((hash * 61 + s.charCodeAt(j)) - 32);
        }

        return hash;
    };

    const getMatch = (hash: number): number => {
        for (let i = 0; i < hashes.length; i++) {
            if (hashes[i] === hash) {
                return i;
            }
        }

        return -1;
    };

    const getHashForName = (dataName: string): number => {
        let dataNameHash = 0;
        for (let j = 0; j < dataName.length; j++) {
            dataNameHash = int32((dataNameHash * 61 + dataName.charCodeAt(j)) - 32);
        }
        return dataNameHash;
    };

    const createString = (...charCodes: number[]): string => {
        let result = '';
        for (const charCode of charCodes) {
            const i = validCharCodes.indexOf(charCode);
            result += validChars[i];
        }

        return result;
    };

    const bruteForceHash = (): void => {
        let l1hash;
        let l2hash;
        let l3hash;
        let l4hash;
        let l5hash;
        let l6hash;
        let l7hash;
        let l8hash;
        let l9hash;
        let hash;

        for (const c1 of validCharCodes) {
            l1hash = c1 - 32;
            for (const c2 of validCharCodes) {
                l2hash = int32(l1hash * 61 + c2 - 32);
                for (const c3 of validCharCodes) {
                    l3hash = int32(l2hash * 61 + c3 - 32);
                    console.log('First 3 characters (out of 9): ' + c1 + c2 + c3);
                    for (const c4 of validCharCodes) {
                        l4hash = int32(l3hash * 61 + c4 - 32);
                        for (const c5 of validCharCodes) {
                            l5hash = int32(l4hash * 61 + c5 - 32);
                            for (const c6 of validCharCodes) {
                                l6hash = int32(l5hash * 61 + c6 - 32);
                                for (const c7 of validCharCodes) {
                                    l7hash = int32(l6hash * 61 + c7 - 32);
                                    for (const c8 of validCharCodes) {
                                        l8hash = int32(l7hash * 61 + c8 - 32);
                                        for (const c9 of validCharCodes) {
                                            l9hash = int32(l8hash * 61 + c9 - 32);
                                            hash = addToHash(".DAT", l9hash);
                                            const resultString = createString(c1, c2, c3, c4, c5, c6, c7, c8, c9);
                                            if (getMatch(hash) !== -1) {
                                                logger.info(resultString + '.DAT : ' + hash);
                                            }

                                            hash = addToHash(".IDX", l9hash);
                                            if (getMatch(hash) !== -1) {
                                                logger.info(resultString + '.IDX : ' + hash);
                                            }
                                            if (getMatch(l9hash) !== -1) {
                                                logger.info(resultString + ' : ' + hash);
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    bruteForceHash();
};


const nameHasher = async () => {
    const start = Date.now();

    const hasher = new NameHasher(join('.', 'config'));

    const fileNames = [
        'leftarrow_small.dat',
        'rightarrow_small.dat',
        'blackmark.dat',
        'button_brown.dat',
        'button_red.dat',
        'key.dat',
        'pen.dat',
        'startgame.dat',
        'titlescroll.dat',
        'letter.dat',
        'button_brown_big.dat',
        'overlay_duel.dat'
    ];

    const keyValueMap: { [key: string]: string } = {};

    for (const fileName of fileNames) {
        keyValueMap[String(hasher.hashJagFileName(fileName))] = fileName;
    }

    console.log(JSON.stringify(keyValueMap, null, 4));

    const end = Date.now();
    logger.info(`Operations completed in ${(end - start) / 1000} seconds.`);
};

nameHasher().catch(console.error);
