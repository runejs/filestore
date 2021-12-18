import { createInterface, Interface } from 'readline';
import { ReadStream, WriteStream } from 'tty';


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

    public close(): void {
        this.instance.close();
    }

}
