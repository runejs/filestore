import { createInterface, Interface } from 'readline';
import { ReadStream, WriteStream } from 'tty';


export type ArgumentMap = Map<string, unknown>;


export class TerminalInterface {

    public readonly input: ReadStream;
    public readonly output: WriteStream;
    public readonly instance: Interface;

    public constructor(input = process.stdin, output = process.stdout) {
        this.input = input;
        this.output = output;
        this.instance = createInterface({
            input: process.stdin,
            output: process.stdout,
            terminal: true
        });
    }

    public async question(query: string, defaultValue?: string): Promise<string> {
        return new Promise(resolve => {
            this.instance.question(query, answer => {
                if(!answer || typeof answer !== 'string' || !answer.trim()) {
                    resolve(defaultValue ?? '');
                } else {
                    resolve(answer);
                }
            });
        });
    }

    public getScriptArguments(): ArgumentMap {
        const args = process.argv.slice(2);
        const argMap: ArgumentMap = new Map<string, unknown>();

        for(let i = 0; i < args.length; i++) {
            const str = args[i];
            if(str?.startsWith('-')) {
                const key: string = str.substring(1);
                let next: string;
                if(i < args.length - 1) {
                    next = args[i + 1];
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
    }

    public close(): void {
        this.instance.close();
    }

    public executeScript(executor: (terminalInterface: TerminalInterface, args: ArgumentMap) => Promise<void>): void {
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const terminal = this;
        const scriptArguments = this.getScriptArguments();

        (async function() {
            await executor(terminal, scriptArguments);
        }());
    }

}
