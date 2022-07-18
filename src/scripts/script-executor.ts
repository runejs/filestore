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
        script: (terminalInterface: ScriptExecutor, args: T
    ) => Promise<void>): void {
        (async function(terminal: ScriptExecutor, args: T) {
            await script(terminal, args);
        }(this, this.getArguments<T>(argumentOptions)))
            .catch(logger.error)
            .finally(() => process.exit(0));
    }

}
