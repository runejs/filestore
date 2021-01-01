import { ConfigStore } from '../config-store';
import { FileData } from '../../file-data';
import { ByteBuffer, logger } from '@runejs/core';
import { Archive } from '../../archive';


/**
 * Contains game client need-to-know level information about a single game item.
 */
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

    /**
     * 2d modelling information for this item
     */
    model2d: {
        widgetModel?: number;
        zoom?: number;
        rotationX?: number;
        rotationY?: number;
        rotationZ?: number;
        offsetX?: number;
        offsetY?: number;
    } = {};

    /**
     * 3d modelling information for this item
     */
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

    /**
     * Additional rendering details
     */
    rendering: {
        resizeX?: number;
        resizeY?: number;
        resizeZ?: number;
        ambient?: number;
        contrast?: number;
    } = {};

}


/**
 * Controls files within the Item Archive of the configuration index.
 */
export class ItemStore {

    /**
     * The Item Archive, containing details about every game item.
     */
    public readonly itemArchive: Archive;

    public constructor(private configStore: ConfigStore) {
        this.itemArchive = this.configStore.getArchive('items');
    }

    public getItem(itemId: number): ItemConfig | null {
        const itemArchive = this.itemArchive;

        if(!itemArchive) {
            logger.error(`Item archive not found.`);
            return null;
        }

        const itemFile = itemArchive.getFile(itemId) || null;

        if(!itemFile) {
            logger.error(`Item file not found.`);
            return null;
        }

        return this.decodeItemFile(itemFile);
    }

    public encodeItemFile(item: ItemConfig): ByteBuffer {
        const buffer = new ByteBuffer(5000);

        const putOpcode = (opcode: number): ByteBuffer => {
            buffer.put(opcode);
            return buffer;
        };

        if(item.model2d.widgetModel !== undefined) {
            putOpcode(1)
                .put(item.model2d.widgetModel, 'SHORT');
        }

        if(item.name) {
            putOpcode(2)
                .putString(item.name);
        }

        putOpcode(4)
            .put(item.model2d.zoom, 'SHORT');
        putOpcode(5)
            .put(item.model2d.rotationX, 'SHORT');
        putOpcode(6)
            .put(item.model2d.rotationY, 'SHORT');
        putOpcode(7)
            .put(item.model2d.offsetX, 'SHORT');
        putOpcode(8)
            .put(item.model2d.offsetY, 'SHORT');

        if(item.stackable) {
            putOpcode(11);
        }

        putOpcode(12)
            .put(item.value, 'INT');

        if(item.members) {
            putOpcode(16);
        }

        if(item.model3d.maleModels[0] !== -1 || item.model3d.maleModelOffset !== undefined) {
            putOpcode(23)
                .put(item.model3d.maleModels[0], 'SHORT')
                .put(item.model3d.maleModelOffset);
        }

        if(item.model3d.maleModels[1] !== -1) {
            putOpcode(24)
                .put(item.model3d.maleModels[1], 'SHORT');
        }

        if(item.model3d.femaleModels[0] !== -1 || item.model3d.femaleModelOffset !== undefined) {
            putOpcode(25)
                .put(item.model3d.femaleModels[0], 'SHORT')
                .put(item.model3d.femaleModelOffset);
        }

        if(item.model3d.femaleModels[1] !== -1) {
            putOpcode(26)
                .put(item.model3d.femaleModels[1], 'SHORT');
        }

        if(item.worldOptions && item.worldOptions.length !== 0) {
            for(let i = 0; i < 5; i++) {
                if(item.worldOptions[i]) {
                    putOpcode(30 + i)
                        .putString(item.worldOptions[i]);
                }
            }
        }

        if(item.widgetOptions && item.widgetOptions.length !== 0) {
            for(let i = 0; i < 5; i++) {
                if(item.widgetOptions[i]) {
                    putOpcode(35 + i)
                        .putString(item.widgetOptions[i]);
                }
            }
        }

        if(item.replacedColors && item.replacedColors.length !== 0) {
            putOpcode(40)
                .put(item.replacedColors.length);
            for(const [ oldColor, newColor ] of item.replacedColors) {
                buffer.put(oldColor, 'SHORT').put(newColor, 'SHORT');
            }
        }

        if(item.replacedTextures && item.replacedTextures.length !== 0) {
            putOpcode(41)
                .put(item.replacedTextures.length);
            for(const [ oldTexture, newTexture ] of item.replacedTextures) {
                buffer.put(oldTexture, 'SHORT').put(newTexture, 'SHORT');
            }
        }

        if(item.tradable) {
            putOpcode(65);
        }

        if(item.model3d.maleModels[2] !== -1) {
            putOpcode(78)
                .put(item.model3d.maleModels[2], 'SHORT');
        }

        if(item.model3d.femaleModels[2] !== -1) {
            putOpcode(79)
                .put(item.model3d.femaleModels[2], 'SHORT');
        }

        if(item.model3d.maleHeadModels[0] !== -1) {
            putOpcode(90)
                .put(item.model3d.maleHeadModels[0], 'SHORT');
        }

        if(item.model3d.femaleHeadModels[0] !== -1) {
            putOpcode(91)
                .put(item.model3d.femaleHeadModels[0], 'SHORT');
        }

        putOpcode(95)
            .put(item.model2d.rotationZ, 'SHORT');

        if(item.bankNoteId) {
            putOpcode(97)
                .put(item.bankNoteId, 'SHORT');
        }

        if(item.bankNoteTemplate) {
            putOpcode(98)
                .put(item.bankNoteTemplate, 'SHORT');
        }

        if(item.stackableIds && item.stackableIds.length !== 0) {
            for(let i = 0; i < 10; i++) {
                putOpcode(100 + i)
                    .put(item.stackableIds[i], 'SHORT')
                    .put(item.stackableAmounts[i], 'SHORT');
            }
        }

        putOpcode(110)
            .put(item.rendering.resizeX, 'SHORT');

        putOpcode(111)
            .put(item.rendering.resizeY, 'SHORT');

        putOpcode(112)
            .put(item.rendering.resizeZ, 'SHORT');

        putOpcode(113)
            .put(item.rendering.ambient);

        putOpcode(114)
            .put(item.rendering.contrast);

        putOpcode(115)
            .put(item.teamId);

        putOpcode(0);

        return buffer.getSlice(0, buffer.writerIndex);
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
                itemConfig.model2d.rotationX = buffer.get('SHORT', 'UNSIGNED');
            } else if(opcode === 6) {
                itemConfig.model2d.rotationY = buffer.get('SHORT', 'UNSIGNED');
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
                itemConfig.replacedColors.fill([ -1, -1 ]);

                for(let colorIndex = 0; colorIndex < colorCount; colorIndex++) {
                    itemConfig.replacedColors[colorIndex][0] = buffer.get('SHORT', 'UNSIGNED');
                    itemConfig.replacedColors[colorIndex][1] = buffer.get('SHORT', 'UNSIGNED');
                }
            } else if(opcode === 41) {
                const textureCount = buffer.get('BYTE', 'UNSIGNED');
                itemConfig.replacedTextures = new Array(textureCount);
                itemConfig.replacedTextures.fill([ -1, -1 ]);

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
                itemConfig.model2d.rotationZ = buffer.get('SHORT', 'UNSIGNED');
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
        const itemArchive = this.itemArchive;

        if(!itemArchive) {
            logger.error(`Item archive not found.`);
            return null;
        }

        const itemCount = itemArchive.files.size;
        const items: ItemConfig[] = new Array(itemCount);

        for(let itemId = 0; itemId < itemCount; itemId++) {
            const itemFile = itemArchive.getFile(itemId) || null;

            if(!itemFile) {
                logger.error(`Item file not found.`);
                return null;
            }

            items[itemId] = this.decodeItemFile(itemFile);
        }

        return items;
    }

}
