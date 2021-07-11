import 'reflect-metadata';
import { DataType, Signedness } from '@runejs/core/buffer';


const rsStringMetadataKey = Symbol('rsStringKey');
const rsNumberMetadataKey = Symbol('rsNumberKey');


export function RsString(key: number, options?: {
    optional?: boolean;
}) {
    return Reflect.metadata(rsStringMetadataKey, {
        key, ...options
    });
}

export function RsNumber(key: number, options?: {
    type?: DataType | 'string';
    signedness?: Signedness;
    optional?: boolean;
}) {
    return Reflect.metadata(rsNumberMetadataKey, { key, ...options });
}


export function getRsString(target: any, propertyKey: string) {
    return Reflect.getMetadata(rsStringMetadataKey, target, propertyKey);
}

export function getRsNumber(target: any, propertyKey: string) {
    return Reflect.getMetadata(rsNumberMetadataKey, target, propertyKey);
}
