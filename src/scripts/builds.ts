import { ScriptExecutor, ArgumentOptions } from './script-executor';
import {
    getAvailableBuilds
} from '../openrs2';
import { logger } from '@runejs/common';


interface BuildsOptions {
    scope: string;
    game: string;
    range?: number;
}


const buildsArgumentOptions: ArgumentOptions = {
    scope: {
        alias: 's',
        type: 'string',
        default: 'runescape',
        description: `The scope to search for available builds for within OpenRS2.org. Defaults to 'runescape'.`
    },
    game: {
        alias: 'g',
        type: 'string',
        default: 'runescape',
        description: `The game to search for available builds for within OpenRS2.org. Defaults to 'runescape'.`
    },
    range: {
        alias: 'r',
        type: 'number',
        description: `The lower number range of builds to search for, ie '400' to return builds between 400-499. Returns all build ranges by default.`
    },
};


const buildsScript = async (
    { scope, game, range }
) => {
    if (range && range % 100 !== 0) {
        logger.error(`Invalid range of ${ range }: Range must be a multiple of 100.`);
        return;
    }

    const availableBuilds = await getAvailableBuilds(scope, game);
    let msg = `Available builds on OpenRS2.org with scope ${ scope } and game ${ game }`;

    if (range) {
        msg += ` for build range ${ range } - ${ range + 99 }`;
    }

    logger.info(`${ msg }:`);

    let lastHundred = 0;

    for (const buildNumber of availableBuilds) {
        const lower100 = Math.floor(buildNumber / 100) * 100;

        if (!range || range === lower100) {
            if (lastHundred !== lower100) {
                logger.info(`[ ${ lower100 } - ${ lower100 + 99 } ]`);
                lastHundred = lower100;
            }

            logger.info(String(buildNumber));
        }
    }
};


new ScriptExecutor().executeScript<BuildsOptions>(buildsArgumentOptions, buildsScript);
