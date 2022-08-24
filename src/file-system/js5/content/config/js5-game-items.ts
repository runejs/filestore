import { Js5FileStore } from '../../js5-file-store';
import { ByteBuffer } from '@runejs/common';


export class Js5GameItem {
    id: number;
}

export class Js5GameItems {

    readonly js5Store: Js5FileStore;
    readonly items: Map<number, Js5GameItem>;

    constructor(js5Store: Js5FileStore) {
        this.js5Store = js5Store;
        this.items = new Map<number, Js5GameItem>();
    }

    decode(id: number, data: ByteBuffer): Js5GameItem {
        const item = new Js5GameItem();
        item.id = id;

        while (true) {
            const opcode = data.get('byte', 'unsigned');
            if (opcode === 0) {
                break;
            }
        }

        return item;
    }

    decodeAll(): void {

    }

}
