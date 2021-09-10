import { logger } from '@runejs/common';


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

    for(let i = 0; i < args.length; i++) {
        const str = args[i];
        if(str?.startsWith('-')) {
            const key: string = str.substring(1);
            let next: string;
            if(i < args.length - 1) {
                next = args[i + 1];
                console.log(next);
                if(!next?.startsWith('-')) {
                    let val: string | boolean = next;
                    if(val === 'true') {
                        val = true;
                    } else if(val === 'false') {
                        val = false;
                    }
                    argMap.set(key, val);
                } else {
                    argMap.set(key, true);
                }
            } else {
                argMap.set(key, true);
            }
        }
    }

    return argMap;
};
