import yargs from 'yargs/yargs';
import { Options } from 'yargs';
import { logger } from '@runejs/common';


export type ArgumentOptions = { [key: string]: Options };


export class ScriptExecutor {

    public getArguments<T>(argumentOptions: ArgumentOptions): T {
        return yargs(process.argv.slice(2)).options(argumentOptions).argv as any as T;
    }

    public executeScript<T>(
        argumentOptions: ArgumentOptions,
        script: (args: T) => Promise<void>
    ): void {
        (async function(args: T) {
            await script(args);
        }(this.getArguments<T>(argumentOptions)));
            //.finally(() => process.exit(0));
    }

}
