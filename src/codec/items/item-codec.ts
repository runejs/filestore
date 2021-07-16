import { RuneTypes, RuneArray, RuneBoolean, RuneGroup, RuneNumber, RuneString, RuneObject } from '../codec';
import { ItemModel2d } from './item-model-2d';
import { ItemModel3d } from './item-model-3d';
import { Replacement } from '../replacement';
import { ItemStackData } from './item-stack-data';
import { ItemRenderingData } from './item-rendering-data';


export class ItemCodec {

    @RuneString({ opcode: 2 })
    public name: string = '';

    @RuneBoolean({ opcode: 11 })
    public stackable: boolean;

    @RuneNumber({ opcode: 12, ...RuneTypes.unsigned_int })
    public value: number = -1;

    @RuneBoolean({ opcode: 16 })
    public members: boolean;

    @RuneString({ opcode: 30 })
    @RuneArray({ length: 5 })
    public groundContextOptions: string[];

    @RuneString({ opcode: 35 })
    @RuneArray({ length: 5 })
    public inventoryContextOptions: string[];

    @RuneObject({ opcode: 40 })
    @RuneArray()
    public modelColorChanges: Replacement[];

    @RuneObject({ opcode: 41 })
    @RuneArray()
    public modelTextureChanges: Replacement[];

    @RuneBoolean({ opcode: 65 })
    public tradable: boolean;

    @RuneNumber({ opcode: 97, ...RuneTypes.unsigned_short })
    public bankNoteId: number;

    @RuneNumber({ opcode: 98, ...RuneTypes.unsigned_short })
    public bankNoteTemplate: number;

    @RuneObject({ opcode: 100 })
    @RuneArray({ length: 10 })
    public itemStack: ItemStackData[];

    @RuneNumber({ opcode: 115, ...RuneTypes.unsigned_byte })
    public teamId: number;

    @RuneGroup()
    public rendering: ItemRenderingData;

    @RuneGroup()
    public model2d: ItemModel2d;

    @RuneGroup()
    public model3d: ItemModel3d;

}
