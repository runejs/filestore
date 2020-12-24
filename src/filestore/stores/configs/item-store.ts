import { ConfigStore } from '../config-store';


export interface ItemConfig {
    name?: string;
    stackable?: boolean;
    value?: number;
    members?: boolean;
    worldOptions?: string[];
    widgetOptions?: string[];
    tradable?: boolean;
    teamId?: number
    replacedColors?: [ number, number ][];
    replacedTextures?: [ number, number ][];
    bankNoteId?: number;
    bankNoteTemplate?: number;
    stackableAmounts?: number[];
    stackableIds?: number[];

    model2d: {
        widgetModel?: number;
        zoom?: number;
        xan?: number;
        yan?: number;
        zan?: number;
        offsetX?: number;
        offsetY?: number;
    };
    model3d: {
        maleModel1?: number;
        maleModel1Offset?: number;
        maleModel2?: number;
        maleModel3?: number;
        maleHeadModel1?: number;
        maleHeadModel2?: number;
        femaleModel1?: number;
        femaleModel1Offset?: number;
        femaleModel2?: number;
        femaleModel3?: number;
        femaleHeadModel1?: number;
        femaleHeadModel2?: number;
    };
    rendering: {
        resizeX?: number;
        resizeY?: number;
        resizeZ?: number;
        ambient?: number;
        contrast?: number;
    };
}

export class ItemStore {

    private readonly configStore: ConfigStore;

    public constructor(configStore: ConfigStore) {
        this.configStore = configStore;
    }

}
