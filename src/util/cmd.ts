import { logger } from '@runejs/core';


export type ArgumentMap = Map<string, unknown>;


export const run = async (executor: (args: ArgumentMap) => void | Promise<void>): Promise<void> => {
    const start = Date.now();

    await executor(getCommandArguments());

    const end = Date.now();
    const duration = end - start;
    logger.info(`Operations completed in ${duration / 1000} seconds.`);
};


export const getCommandArguments = (): ArgumentMap => {
    const args = process.argv.slice(2);
    const argMap: ArgumentMap = new Map<string, unknown>();

    for(const str of args) {
        if(!str.startsWith('-')) {
            continue;
        }

        const parts: [ string, unknown? ] = str.split('=') as [ string, unknown? ];
        if(parts.length === 1) {
            parts.push(true);
        }

        let value: unknown = parts[1];
        if(!!value) {
            if(value === 'true') {
                value = true;
            } else if(value === 'false') {
                value = false;
            }
        }

        argMap.set(parts[0].replace(/-/g, ''), value);
    }

    return argMap;
};
