import 'reflect-metadata';
import { DataType, Signedness } from '@runejs/core/buffer';



const rjsStringMetadataKey = Symbol('rjsStringKey');
const rjsNumberMetadataKey = Symbol('rjsNumberKey');
const rjsBooleanMetadataKey = Symbol('rjsBooleanKey');
const rjsObjectMetadataKey = Symbol('rjsObjectKey');
const rjsGroupMetadataKey = Symbol('rjsGroupKey');
const rjsArrayMetadataKey = Symbol('rjsArrayKey');



export interface RuneOptions {
    opcode?: number;
    required?: boolean;
}
export interface RuneNumberOptions extends RuneOptions {
    type?: DataType | 'string';
    signedness?: Signedness;
}
export interface RuneArrayOptions extends RuneOptions {
    length?: number;
}


export class RuneTypes {

    /**
     * `{ type: 'byte' }`<br>
     * Signed `byte` variant.
     */
    public static readonly byte: RuneNumberOptions =
        { type: 'byte' };

    /**
     * `{ type: 'byte', signedness: 'u' }`<br>
     * Unsigned `byte` variant.
     */
    public static readonly unsigned_byte: RuneNumberOptions =
        { type: 'byte', signedness: 'u' };

    /**
     * `{ type: 'short' }`<br>
     * Signed `short` variant.
     */
    public static readonly short: RuneNumberOptions =
        { type: 'short' };

    /**
     * `{ type: 'short', signedness: 'u' }`<br>
     * Unsigned `short` variant.
     */
    public static readonly unsigned_short: RuneNumberOptions =
        { type: 'short', signedness: 'u' };

    /**
     * `{ type: 'int' }`<br>
     * Signed `int` variant.
     */
    public static readonly int: RuneNumberOptions =
        { type: 'int' };

    /**
     * `{ type: 'int', signedness: 'u' }`<br>
     * Unsigned `int` variant.
     */
    public static readonly unsigned_int: RuneNumberOptions =
        { type: 'int', signedness: 'u' }

}



export function RuneString(options?: RuneOptions) {
    return Reflect.metadata(rjsStringMetadataKey, options);
}
export function RuneNumber(options?: RuneNumberOptions) {
    return Reflect.metadata(rjsNumberMetadataKey, options);
}

export function RuneBoolean(options?: RuneOptions) {
    return Reflect.metadata(rjsBooleanMetadataKey, options);
}

export function RuneObject(options?: RuneOptions) {
    return Reflect.metadata(rjsObjectMetadataKey, options);
}

export function RuneGroup(options?: RuneOptions) {
    return Reflect.metadata(rjsGroupMetadataKey, {
        ...options, group: true
    });
}

export function RuneArray(options?: RuneArrayOptions) {
    return Reflect.metadata(rjsArrayMetadataKey, options ?? null);
}



export const getRsString = (target: any, propertyKey: string) =>
    Reflect.getMetadata(rjsStringMetadataKey, target, propertyKey);

export const getRsNumber = (target: any, propertyKey: string) =>
    Reflect.getMetadata(rjsNumberMetadataKey, target, propertyKey);

export const getRuneBoolean = (target: any, propertyKey: string) =>
    Reflect.getMetadata(rjsBooleanMetadataKey, target, propertyKey);

export const getRuneObject = (target: any, propertyKey: string) =>
    Reflect.getMetadata(rjsObjectMetadataKey, target, propertyKey);

export const getRuneGroup = (target: any, propertyKey: string) =>
    Reflect.getMetadata(rjsGroupMetadataKey, target, propertyKey);

export const getRuneArray = (target: any, propertyKey: string) =>
    Reflect.getMetadata(rjsArrayMetadataKey, target, propertyKey);

