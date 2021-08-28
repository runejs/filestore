import { ByteBuffer, DataType, Signedness } from '@runejs/core/buffer';
import { logger } from '@runejs/core';

require('json5/lib/register');


export type JsonInstructions =
    string |
    [ string, string?, string? ] |
    [ string, string?, string? ][] |
    [ string, [ string, string?, string? ] ] |
    [ string, [ string, string?, string? ][] ];

export interface FileInstructions {
    type?: string;
    [key: string]: JsonInstructions;
}

export interface NormalizedInstructions {
    [key: number]: JsonInstructions;
}


export class JsonFileTranscoder {

    private _fileType: string | undefined;
    private _instructions: NormalizedInstructions = {};

    public constructor(private _codecInstructionFile: string) {
        this.loadCodecInstructions();
    }

    public decodeBinaryFile(fileId: number, fileData: ByteBuffer): any {
        const decoded: any = {
            id: fileId
        };

        fileData.readerIndex = 0;
        let run = false;

        while(run) {
            if(!fileData.readable) {
                run = false;
                break;
            }

            const key = fileData.get('byte', 'unsigned');
            if(key === 0) {
                // End of file
                run = false;
                break;
            }

            const instruction: JsonInstructions = this._instructions[key];
            if(!instruction) {
                logger.error(`Instruction ${key} not found for ${this._fileType} file ${fileId}.`);
                run = false;
                break;
            }

            if(!Array.isArray(instruction)) {
                logger.error(`Instruction ${key} is malformed for ${this._fileType} file ${fileId}.`);
                run = false;
                break;
            }

            try {
                if(typeof instruction[0] === 'string') {
                    // Single field
                    let fieldName = instruction[0];
                    let fieldIndex: number = -1;

                    const startIdx = fieldName.indexOf('[');
                    const endIdx = fieldName.indexOf(']');
                    if(startIdx !== -1 && endIdx !== -1) {
                        fieldIndex = Number(fieldName.substring(startIdx, endIdx));
                        if(isNaN(fieldIndex)) {
                            fieldIndex = -1;
                        } else {
                            fieldName = fieldName.substring(0, startIdx);
                        }
                    }

                    if(instruction.length === 1) {
                        // Truthy boolean field
                        if(fieldIndex !== -1) {
                            if(!decoded[fieldName]) {
                                decoded[fieldName] = [];
                            }
                            decoded[fieldName].push(true);
                        } else {
                            decoded[fieldName] = true;
                        }
                    } else if(typeof instruction[1] === 'string') {
                        // Basic single field
                        const fieldType = instruction[1] as DataType | 'string';
                        const signedness = (instruction.length === 3 ? instruction[2] : 'signed') as Signedness;

                        if(fieldIndex !== -1) {
                            if(!decoded[fieldName]) {
                                decoded[fieldName] = [];
                            }

                            if(fieldType === 'string') {
                                decoded[fieldName].push(fileData.getString());
                            } else {
                                decoded[fieldName].push(fileData.get(fieldType, signedness));
                            }
                        } else {
                            if(fieldType === 'string') {
                                decoded[fieldName] = fileData.getString();
                            } else {
                                decoded[fieldName] = fileData.get(fieldType, signedness);
                            }
                        }
                    } else if(Array.isArray(instruction[1])) {
                        // Array of object-type fields
                        const objectCount = fileData.get('byte', 'unsigned');
                        decoded[fieldName] = new Array(objectCount);
                        for(let i = 0; i < objectCount; i++) {
                            const objectInstruction = instruction[1][i] as [ string, string?, string? ];
                            const subFieldName = objectInstruction[0];

                            if(objectInstruction.length === 1) {
                                decoded[fieldName][i][subFieldName] = true;
                            } else {
                                const subFieldType = objectInstruction[1] as DataType;
                                const subFieldSignedness = (instruction.length === 3 ? instruction[2] : 'signed') as Signedness;
                                decoded[fieldName][i][subFieldName] = fileData.get(subFieldType, subFieldSignedness);
                            }
                        }
                    }
                } else if(Array.isArray(instruction[0])) {
                    // Array of basic fields
                    for(const lineItem of instruction[0]) {
                        if(!lineItem?.length) {
                            continue;
                        }

                        let fieldName = lineItem[0];
                        let fieldIndex: number = -1;

                        const startIdx = fieldName.indexOf('[');
                        const endIdx = fieldName.indexOf(']');
                        if(startIdx !== -1 && endIdx !== -1) {
                            fieldIndex = Number(fieldName.substring(startIdx, endIdx));
                            if(isNaN(fieldIndex)) {
                                fieldIndex = -1;
                            } else {
                                fieldName = fieldName.substring(0, startIdx);
                            }
                        }

                        if(lineItem.length === 1) {
                            if(fieldIndex !== -1) {
                                if(!decoded[fieldName]) {
                                    decoded[fieldName] = [];
                                }
                                decoded[fieldName].push(true);
                            } else {
                                decoded[fieldName] = true;
                            }
                        } else {
                            const fieldType = lineItem[1] as DataType | 'string';
                            const signedness = (lineItem.length === 3 ? lineItem[2] : 'signed') as Signedness;

                            if(fieldIndex !== -1) {
                                if(!decoded[fieldName]) {
                                    decoded[fieldName] = [];
                                }

                                if(fieldType === 'string') {
                                    decoded[fieldName].push(fileData.getString());
                                } else {
                                    decoded[fieldName].push(fileData.get(fieldType, signedness));
                                }
                            } else {
                                if(fieldType === 'string') {
                                    decoded[fieldName] = fileData.getString();
                                } else {
                                    decoded[fieldName] = fileData.get(fieldType, signedness);
                                }
                            }
                        }
                    }
                }
            } catch(error) {
                logger.error(`Error decoding binary file ${fileId}:`);
                logger.error(error);
            }
        }

        console.log(decoded);
        return decoded;
    }

    protected normalizeInstructions(instructions: FileInstructions): void {
        const instructionKeys = Object.keys(instructions);
        if(!instructionKeys?.length) {
            return;
        }

        for(const stringKey of instructionKeys) {
            if(!stringKey || stringKey === 'type') {
                continue;
            }

            const instruction: JsonInstructions = instructions[stringKey];

            if(stringKey.includes('-')) {
                // Key range
                const stringRange = stringKey.split('-');
                if(!stringRange || stringRange.length !== 2) {
                    logger.warn(`Skipping instruction ${stringKey} as it has a malformed number range.`);
                    continue;
                }

                const min = Number(stringRange[0]);
                const max = Number(stringRange[1]);

                if(isNaN(min) || isNaN(max)) {
                    logger.warn(`Skipping instruction ${stringKey} as it has an invalid or non-numeric range.`);
                    continue;
                }

                const diff = max - min;
                for(let i = 0; i < diff + 1; i++) {
                    if(typeof instruction !== 'string') {
                        if(typeof instruction[0] === 'string') {
                            const newInstruction: JsonInstructions = [ ...instruction ];
                            newInstruction[0] = `${instruction[0]}[${i}]`;
                            this._instructions[min + i] = newInstruction;
                        } else if(Array.isArray(instruction[0])) {
                            for(const lineItem of instruction) {
                                if(Array.isArray(lineItem)) {
                                    const newInstruction: JsonInstructions = [ ...lineItem ];
                                    newInstruction[0] = `${lineItem[0]}[${i}]`;
                                    this._instructions[min + i] = newInstruction;
                                }
                            }
                        }
                    } else {
                        this._instructions[min + i] = instruction;
                    }
                }
            } else {
                const key = Number(stringKey);
                if(isNaN(key)) {
                    logger.warn(`Skipping instruction ${stringKey} as it has a non-numeric key.`);
                    continue;
                }

                this._instructions[key] = instruction;
            }
        }

        console.log(this._instructions);
    }

    protected loadCodecInstructions(): void {
        let instructions: FileInstructions | undefined;

        try {
            instructions = require(`../../codec/${this.codecInstructionFile}`);
        } catch(error) {
            logger.error(`Error loading codec instruction file ${this.codecInstructionFile}:`);
            logger.error(error);
        }

        if(!instructions) {
            return;
        }

        this._fileType = instructions.type;
        this.normalizeInstructions(instructions);
    }

    public get codecInstructionFile(): string {
        return this._codecInstructionFile;
    }

    public get fileType(): string | undefined {
        return this._fileType;
    }

    public get instructions(): NormalizedInstructions | undefined {
        return this._instructions;
    }
}
