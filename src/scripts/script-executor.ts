import yargs from 'yargs/yargs';
import { Options } from 'yargs';


export type ArgumentOptions = { [key: string]: Options };


export class ScriptExecutor {

    public getArguments<T>(argumentOptions: ArgumentOptions): T {
        return yargs(process.argv.slice(2)).options(argumentOptions).argv as any as T;
    }

    public executeScript<T>(
        argumentOptions: ArgumentOptions,
        script: (args: T) => Promise<void | unknown>
    ): void {
        (async function(args: T) {
            await script(args);
        }(this.getArguments<T>(argumentOptions)));
    }

}
