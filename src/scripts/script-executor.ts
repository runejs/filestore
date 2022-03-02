import yargs from 'yargs/yargs';
import { Options } from 'yargs';


export type ArgumentOptions = { [key: string]: Options };


export class ScriptExecutor {

    public getArguments<T>(argumentOptions: ArgumentOptions): T {
        return yargs(process.argv.slice(2)).options(argumentOptions).argv as any as T;
    }

    public executeScript<T>(argumentOptions: ArgumentOptions,
                         executor: (terminalInterface: ScriptExecutor, args: T) => Promise<void>): void {
        (async function(terminal: ScriptExecutor, args: T) {
            await executor(terminal, args);
        }(this, this.getArguments<T>(argumentOptions)));
    }

}
