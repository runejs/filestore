import { Js5FileStore } from '../../js5-file-store';
import { ByteBuffer } from '@runejs/common';


export class Js5GameItem {
    id: number;
    inventoryModelId: number;
    name: string;
    modelZoom: number;
    modelRotationX: number;
    modelRotationY: number;
    modelOffsetX: number;
    modelOffsetY: number;
    unknownServerAttribute1: number;
    stackable: boolean = false;
    value: number;
    members: boolean = false;
    maleModelId1: number;
    maleModelOffset: number;
    maleModelId2: number;
    femaleModelId1: number;
    femaleModelOffset: number;
    femaleModelId2: number;
    groundOptions: string[];
    interfaceOptions: string[];
    originalModelColors: number[];
    modifiedModelColors: number[];
    maleModelId3: number;
    femaleModelId3: number;
    maleDialogueModelId1: number;
    femaleDialogueModelId1: number;
    maleDialogueModelId2: number;
    femaleDialogueModelId2: number;
    modelRotationZ: number;
    noteId: number;
    noteTemplateId: number;
    stackIds: number[];
    stackAmounts: number[];
    modelScaleX: number;
    modelScaleY: number;
    modelScaleZ: number;
    lightingModifier: number;
    shadowModifier: number;
    teamIndex: number;
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
            const o = data.get('byte', 'u');

            if (o === 0) {
                break; // eof
            } else if (o === 1) {
                item.inventoryModelId = data.get('short', 'u');
            } else if (o === 2) {
                item.name = data.getString();
            } else if (o === 4) {
                // case 3 was item description prior to build 400
                item.modelZoom = data.get('short', 'u');
            } else if (o === 5) {
                item.modelRotationX = data.get('short', 'u');
            } else if (o === 6) {
                item.modelRotationY = data.get('short', 'u');
            } else if (o === 7) {
                // client subtracts 65536 if the value is over 32767
                // so this should be a SIGNED short then, right?...
                item.modelOffsetX = data.get('short', 'u');
            } else if (o === 8) {
                // client subtracts 65536 if the value is over 32767
                // so this should be a SIGNED short then, right?...
                item.modelOffsetY = data.get('short', 'u');
            } else if (o === 10) {
                // case 9 missing - what was it (if anything)?
                item.unknownServerAttribute1 = data.get('short', 'u');
            } else if (o === 11) {
                item.stackable = true;
            } else if (o === 12) {
                item.value = data.get('int');
            } else if (o === 16) {
                // cases 13-15 missing - what were they (if anything)?
                item.members = true;
            } else if (o === 23) {
                // cases 17-22 missing - what were they (if anything)?
                item.maleModelId1 = data.get('short', 'u');
                item.maleModelOffset = data.get('byte');
            } else if (o === 24) {
                item.maleModelId2 = data.get('short', 'u');
            } else if (o === 25) {
                item.femaleModelId1 = data.get('short', 'u');
                item.femaleModelOffset = data.get('byte');
            } else if (o === 26) {
                item.femaleModelId2 = data.get('short', 'u');
            } else if (o >= 30 && o < 35) {
                // cases 27-29 missing - what were they (if anything)?
                if (!item.groundOptions) {
                    item.groundOptions = new Array(5);
                }

                item.groundOptions[o - 30] = data.getString();
            } else if (o >= 35 && o < 40) {
                if (!item.interfaceOptions) {
                    item.interfaceOptions = new Array(5);
                }

                item.interfaceOptions[o - 35] = data.getString();
            } else if (o === 40) {
                const colorCount = data.get('byte', 'u');
                item.originalModelColors = new Array(colorCount);
                item.modifiedModelColors = new Array(colorCount);
                for (let i = 0; i < colorCount; i++) {
                    item.originalModelColors[i] = data.get('short', 'u');
                    item.modifiedModelColors[i] = data.get('short', 'u');
                }
            } else if (o === 78) {
                // cases 41-77 missing - what were they (if anything)?
                item.maleModelId3 = data.get('short', 'u');
            } else if (o === 79) {
                item.femaleModelId3 = data.get('short', 'u');
            } else if (o === 90) {
                item.maleDialogueModelId1 = data.get('short', 'u');
            } else if (o === 91) {
                item.femaleDialogueModelId1 = data.get('short', 'u');
            } else if (o === 92) {
                item.maleDialogueModelId2 = data.get('short', 'u');
            } else if (o === 93) {
                item.femaleDialogueModelId2 = data.get('short', 'u');
            } else if (o === 95) {
                // case 94 missing - what was it (if anything)?
                item.modelRotationZ = data.get('short', 'u');
            } else if (o === 97) {
                // case 96 missing - what was it (if anything)?
                item.noteId = data.get('short', 'u');
            } else if (o === 98) {
                item.noteTemplateId = data.get('short', 'u');
            } // @todo stopped here - 24/08/22 - Kiko
        }

        return item;
    }

    decodeAll(): void {

    }

}
