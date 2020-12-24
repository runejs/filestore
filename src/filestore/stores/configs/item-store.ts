import { ConfigStore } from '../config-store';
import { FileData } from '../../file-data';


export class ItemConfig {
    gameId: number;
    name: string | null = null;
    stackable?: boolean;
    value: number = 0;
    members?: boolean;
    worldOptions?: string[];
    widgetOptions?: string[];
    tradable?: boolean;
    teamId?: number;
    replacedColors?: [ number, number ][]; // [ originalColor, newColor ][]
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
    } = {};
    model3d: {
        maleModels: [ number, number, number ];
        maleHeadModels: [ number, number ];
        maleModelOffset?: number;
        femaleModels: [ number, number, number ];
        femaleHeadModels: [ number, number ];
        femaleModelOffset?: number;
    } = {
        maleModels: [ -1, -1, -1 ],
        maleHeadModels: [ -1, -1 ],
        femaleModels: [ -1, -1, -1 ],
        femaleHeadModels: [ -1, -1 ]
    };
    rendering: {
        resizeX?: number;
        resizeY?: number;
        resizeZ?: number;
        ambient?: number;
        contrast?: number;
    } = {};
}


export class ItemStore {

    private readonly configStore: ConfigStore;

    public constructor(configStore: ConfigStore) {
        this.configStore = configStore;
    }

    public getItem(itemId: number): ItemConfig | null {
        const itemArchive = this.configStore.getItemArchive();

        if(!itemArchive) {
            return null;
        }

        const itemFile = itemArchive.getFile(itemId) || null;

        if(!itemFile) {
            return null;
        }

        return this.decodeItemFile(itemFile);
    }

    public decodeItemFile(itemFile: FileData): ItemConfig {
        const itemConfig = new ItemConfig();

        const buffer = itemFile.content;
        itemConfig.gameId = itemFile.fileId;

        while(true) {
            const opcode = buffer.get('BYTE', 'UNSIGNED');
            if(opcode === 0) {
                break;
            }

            if(opcode === 1) {
                itemConfig.model2d.widgetModel = buffer.get('SHORT', 'UNSIGNED');
            } else if(opcode === 2) {
                itemConfig.name = buffer.getString();
            } else if(opcode === 4) {
                itemConfig.model2d.zoom = buffer.get('SHORT', 'UNSIGNED');
            } else if(opcode === 5) {
                itemConfig.model2d.xan = buffer.get('SHORT', 'UNSIGNED');
            } else if(opcode === 6) {
                itemConfig.model2d.yan = buffer.get('SHORT', 'UNSIGNED');
            } else if(opcode === 7) {
                itemConfig.model2d.offsetX = buffer.get('SHORT', 'UNSIGNED');
                if(itemConfig.model2d.offsetX > 32767) {
                    itemConfig.model2d.offsetX -= 65536;
                }
            } else if(opcode === 8) {
                itemConfig.model2d.offsetY = buffer.get('SHORT', 'UNSIGNED');
                if(itemConfig.model2d.offsetY > 32767) {
                    itemConfig.model2d.offsetY -= 65536;
                }
            } else if(opcode === 11) {
                itemConfig.stackable = true;
            } else if(opcode === 12) {
                itemConfig.value = buffer.get('INT');
            } else if(opcode === 16) {
                itemConfig.members = true;
            } else if(opcode === 23) {
                itemConfig.model3d.maleModels[0] = buffer.get('SHORT', 'UNSIGNED');
                itemConfig.model3d.maleModelOffset = buffer.get('BYTE', 'UNSIGNED');
            } else if(opcode === 24) {
                itemConfig.model3d.maleModels[1] = buffer.get('SHORT', 'UNSIGNED');
            } else if(opcode === 25) {
                itemConfig.model3d.femaleModels[0] = buffer.get('SHORT', 'UNSIGNED');
                itemConfig.model3d.femaleModelOffset = buffer.get('BYTE', 'UNSIGNED');
            } else if(opcode === 26) {
                itemConfig.model3d.femaleModels[1] = buffer.get('SHORT', 'UNSIGNED');
            } else if(opcode >= 30 && opcode < 35) {
                if(!itemConfig.worldOptions) {
                    itemConfig.worldOptions = new Array(5).fill(null);
                }

                itemConfig.worldOptions[opcode - 30] = buffer.getString();

                if(itemConfig.worldOptions[opcode - 30] === 'Hidden' || itemConfig.worldOptions[opcode - 30] === 'hidden') {
                    itemConfig.worldOptions[opcode - 30] = null;
                }
            } else if(opcode >= 35 && opcode < 40) {
                if(!itemConfig.widgetOptions) {
                    itemConfig.widgetOptions = new Array(5).fill(null);
                }

                itemConfig.widgetOptions[opcode - 35] = buffer.getString();

                if(itemConfig.widgetOptions[opcode - 35] === 'Hidden' || itemConfig.widgetOptions[opcode - 35] === 'hidden') {
                    itemConfig.widgetOptions[opcode - 35] = null;
                }
            } else if(opcode === 40) {
                const colorCount = buffer.get('BYTE', 'UNSIGNED');
                itemConfig.replacedColors = new Array(colorCount);

                for(let colorIndex = 0; colorIndex < colorCount; colorIndex++) {
                    itemConfig.replacedColors[colorIndex][0] = buffer.get('SHORT', 'UNSIGNED');
                    itemConfig.replacedColors[colorIndex][1] = buffer.get('SHORT', 'UNSIGNED');
                }
            } else if(opcode === 41) {
                const textureCount = buffer.get('BYTE', 'UNSIGNED');
                itemConfig.replacedTextures = new Array(textureCount);

                for(let textureIndex = 0; textureIndex < textureCount; textureIndex++) {
                    itemConfig.replacedTextures[textureIndex][0] = buffer.get('SHORT', 'UNSIGNED');
                    itemConfig.replacedTextures[textureIndex][1] = buffer.get('SHORT', 'UNSIGNED');
                }
            } else if(opcode === 65) {
                itemConfig.tradable = true;
            } else if(opcode == 78) {
                itemConfig.model3d.maleModels[2] = buffer.get('SHORT', 'UNSIGNED');
            } else if(opcode == 79) {
                itemConfig.model3d.femaleModels[2] = buffer.get('SHORT', 'UNSIGNED');
            } else if(opcode == 90) {
                itemConfig.model3d.maleHeadModels[0] = buffer.get('SHORT', 'UNSIGNED');
            } else if(opcode == 91) {
                itemConfig.model3d.femaleHeadModels[0] = buffer.get('SHORT', 'UNSIGNED');
            } else if(opcode == 92) {
                itemConfig.model3d.maleHeadModels[1] = buffer.get('SHORT', 'UNSIGNED');
            } else if(opcode == 93) {
                itemConfig.model3d.femaleHeadModels[1] = buffer.get('SHORT', 'UNSIGNED');
            } else if(opcode == 95) {
                itemConfig.model2d.zan = buffer.get('SHORT', 'UNSIGNED');
            } else if(opcode == 97) {
                itemConfig.bankNoteId = (buffer.get('SHORT', 'UNSIGNED'));
            } else if(opcode == 98) {
                itemConfig.bankNoteTemplate = (buffer.get('SHORT', 'UNSIGNED'));
            } else if(opcode >= 100 && opcode < 110) {
                if(!itemConfig.stackableIds) {
                    itemConfig.stackableAmounts = new Array(10);
                    itemConfig.stackableIds = new Array(10);
                }
                itemConfig.stackableIds[opcode - 100] = (buffer.get('SHORT', 'UNSIGNED'));
                itemConfig.stackableAmounts[opcode - 100] = (buffer.get('SHORT', 'UNSIGNED'));
            } else if(opcode == 110) {
                itemConfig.rendering.resizeX = buffer.get('SHORT', 'UNSIGNED');
            } else if(opcode == 111) {
                itemConfig.rendering.resizeY = buffer.get('SHORT', 'UNSIGNED');
            } else if(opcode == 112) {
                itemConfig.rendering.resizeZ = buffer.get('SHORT', 'UNSIGNED');
            } else if(opcode == 113) {
                itemConfig.rendering.ambient = buffer.get('BYTE');
            } else if(opcode == 114) {
                itemConfig.rendering.contrast = buffer.get('BYTE');
            } else if(opcode == 115) {
                itemConfig.teamId = buffer.get('BYTE', 'UNSIGNED');
            }
        }

        return itemConfig;
    }

    public decodeItemStore(): ItemConfig[] {
        const itemArchive = this.configStore.getItemArchive();

        if(!itemArchive) {
            return null;
        }

        const itemCount = itemArchive.files.size;
        const items: ItemConfig[] = new Array(itemCount);

        for(let itemId = 0; itemId < itemCount; itemId++) {
            const itemFile = itemArchive.getFile(itemId) || null;

            if(!itemFile) {
                return null;
            }

            items[itemId] =  this.decodeItemFile(itemFile);
        }

        return items;
    }

}
