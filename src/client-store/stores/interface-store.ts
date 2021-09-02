import { ByteBuffer } from '@runejs/core/buffer';

import { ClientFileStore } from '../client-file-store';
import { ClientFile } from '../client-file';
import { ClientFileGroup } from '../client-file-group';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { logger } from '@runejs/core';
import { Store } from './store';


export abstract class InterfaceBase {

    public id: number;
    public parentId: number;
    public type: number;
    public format: number;
    public originalX: number;
    public originalY: number;
    public x: number;
    public y: number;
    public width: number;
    public height: number;
    public menuType: number;
    public contentType: number;
    public opacity: number;
    public hidden: boolean;
    public targetVerb: string;
    public spellName: string;
    public clickMask: number;
    public hintText: string;
    public hoveredSiblingId: number;
    public alternateOperators: number[];
    public alternateRhs: number[];
    public cs1: number[][];
    public hasListeners: boolean;

    /**
     * Writes this unpacked interface file to the disk under `./unpacked/interface/{interfaceId}.json`
     */
    public async writeToDisk(): Promise<void> {
        return new Promise((resolve, reject) => {
            try {
                if(!existsSync('./unpacked/interfaces')) {
                    mkdirSync('./unpacked/interfaces');
                }

                const { id } = this;

                writeFileSync(`./unpacked/interfaces/${id}.json`, JSON.stringify(this, null, 4));

                resolve();
            } catch(error) {
                reject(error);
            }
        });
    }

}

export class ParentInterface extends InterfaceBase {

    public children: InterfaceBase[];

    public constructor(id: number) {
        super();
        this.id = id;
    }

}

export class ContainerInterface extends InterfaceBase {
    public type: number = 0;
    public scrollHeight: number;
    public scrollPosition: number;
    public scrollWidth: number;
    public children?: InterfaceBase[];
}

export class TextInterface extends InterfaceBase {
    type: number = 1;
    textAlignmentX: number;
    textAlignmentY: number;
    lineHeight: number;
    fontId: number;
    textShadowed: boolean;
    textColor: number;
}

export class InteractableItemInterface extends InterfaceBase {
    type: number = 2;
    items: number[];
    itemAmounts: number[];
    itemSwapable: boolean;
    isInventory: boolean;
    itemUsable: boolean;
    itemDeletesDraged: boolean;
    itemSpritePadsX: number;
    itemSpritePadsY: number;
    imageX: number[];
    imageY: number[];
    images: number[];
    options: string[];
}

export class RectangleInterface extends InterfaceBase {
    type: number = 3;
    filled: boolean;
    textColor: number;
    alternateTextColor: number;
    hoveredTextColor: number;
    alternateHoveredTextColor: number;
}

export class LinkInterface extends InterfaceBase {
    type: number = 4;
    textAlignmentX: number;
    textAlignmentY: number;
    lineHeight: number;
    fontId: number;
    textShadowed: boolean;
    text: string;
    alternateText: string;
    textColor: number;
    alternateTextColor: number;
    hoveredTextColor: number;
    alternateHoveredTextColor: number;
}

export class SpriteInterface extends InterfaceBase {
    type: number = 5;
    spriteId: number;
    alternateSpriteId: number;

    textureId: number;
    tiled: boolean;
}

export class ModelInterface extends InterfaceBase {
    type: number = 6;
    modelType: number;
    modelId: number;
    alternateModelType: number;
    alternateModelId: number;
    animation: number;
    alternateAnimation: number;
    modelZoom: number;
    rotationX: number;
    rotationY: number;
    rotationZ: number;
    offsetX: number;
    offsetY: number;
    orthogonal: boolean;
}

export class StaticItemInterface extends InterfaceBase {
    type: number = 7;
    items: number[];
    itemAmounts: number[];
    isInventory: boolean;
    itemSpritePadsX: number;
    itemSpritePadsY: number;
    options: string[];
    textAlignmentX: number;
    fontId: number;
    textShadowed: boolean;
    textColor: number;
}

export class TooltipInterface extends InterfaceBase {
    type: number = 8;
    text: string;
}

export class LineInterface extends InterfaceBase {
    type: number = 9;
    lineWidth: number;
    textColor: number;
}


/**
 * Controls game interface file format and storage.
 */
export class InterfaceStore extends Store {

    public constructor(fileStore: ClientFileStore) {
        super(fileStore, 'interfaces');
    }

    /**
     * Writes all unpacked interface files to the disk under `./unpacked/interfaces/`
     */
    public async writeToDisk(): Promise<void> {
        const interfaces = this.decodeInterfaceStore();
        for(const i of interfaces) {
            try {
                await i.writeToDisk();
            } catch(e) {
                logger.error(e);
            }
        }
    }

    /**
     * Decodes the specified interface file.
     * @param id The numeric ID of the interface file to decode.
     */
    public decodeInterface(id: number): InterfaceBase {
        const file = this.clientArchive.groups.get(id);
        if(file.type === 'file') {
            return this.decodeInterfaceFile(id, file);
        } else if(file.type === 'group') {
            const parentInterface = new ParentInterface(id);
            const archive: ClientFileGroup = file as ClientFileGroup;
            archive.decodeGroupFiles();
            const interfaceChildren: ClientFile[] = Array.from(archive.groups.values());
            parentInterface.children = new Array(interfaceChildren.length);
            for(let i = 0; i < interfaceChildren.length; i++) {
                parentInterface.children[i] = this.decodeInterfaceFile(i, interfaceChildren[i]);
            }

            return parentInterface;
        }
    }

    /**
     * Decodes the specified interface file, first determining if it is in the new or old format.
     * @param id The numeric ID of the interface file to decode.
     * @param interfaceFile The file data of the interface file to decode.
     */
    public decodeInterfaceFile(id: number, interfaceFile: ClientFile | ClientFileGroup): InterfaceBase {
        if(!interfaceFile.fileData) {
            interfaceFile.decompress();
        }

        const content = interfaceFile.fileData;
        if(content[0] === -1) {
            return this.decodeInterfaceFormat2(id, content);
        } else {
            return this.decodeInterfaceFormat1(id, content);
        }
    }

    /**
     * Decodes all interface files within the filestore.
     * @returns The list of decoded InterfaceBase objects from the interface store.
     */
    public decodeInterfaceStore(): InterfaceBase[] {
        const interfaceCount = this.clientArchive.groups.size;
        const interfaces: InterfaceBase[] = new Array(interfaceCount);
        for(let interfaceId = 0; interfaceId < interfaceCount; interfaceId++) {
            try {
                interfaces[interfaceId] = this.decodeInterface(interfaceId);
            } catch(error) {
                logger.error(`Error decoding interface ${interfaceId}:`);
                logger.error(error);
            }
        }

        return interfaces;
    }

    public createInterface(interfaceType: number): InterfaceBase {
        let newInterface: InterfaceBase;

        if(interfaceType === 0) {
            newInterface = new ContainerInterface();
        } else if(interfaceType === 1) {
            newInterface = new TextInterface();
        } else if(interfaceType === 2) {
            newInterface = new InteractableItemInterface();
        } else if(interfaceType === 3) {
            newInterface = new RectangleInterface();
        } else if(interfaceType === 4) {
            newInterface = new LinkInterface();
        } else if(interfaceType === 5) {
            newInterface = new SpriteInterface();
        } else if(interfaceType === 6) {
            newInterface = new ModelInterface();
        } else if(interfaceType === 7) {
            newInterface = new StaticItemInterface();
        } else if(interfaceType === 8) {
            newInterface = new TooltipInterface();
        } else if(interfaceType === 9) {
            newInterface = new LineInterface();
        }

        return newInterface;
    }

    public decodeInterfaceFormat2(interfaceId: number, buffer: ByteBuffer): InterfaceBase {
        buffer = new ByteBuffer(buffer);

        buffer.readerIndex = 1; // skip the first byte for the new format

        const interfaceType = buffer.get('BYTE');
        const base: InterfaceBase = this.createInterface(interfaceType);

        base.id = interfaceId;
        base.format = 2;

        base.contentType = buffer.get('SHORT', 'UNSIGNED');
        base.originalX = buffer.get('SHORT');
        base.originalY = buffer.get('SHORT');
        base.width = buffer.get('SHORT', 'UNSIGNED');

        base.x = base.originalX;
        base.y = base.originalY;

        if(base instanceof LineInterface) {
            base.height = buffer.get('SHORT');
        } else {
            base.height = buffer.get('SHORT', 'UNSIGNED');
        }

        base.parentId = buffer.get('SHORT', 'UNSIGNED');
        if(base.parentId === 0xffff) {
            base.parentId = -1;
        }

        base.hidden = buffer.get('BYTE', 'UNSIGNED') === 1;
        base.hasListeners = buffer.get('BYTE', 'UNSIGNED') === 1;

        if(base instanceof ContainerInterface) {
            base.scrollWidth = buffer.get('SHORT', 'UNSIGNED');
            base.scrollPosition = buffer.get('SHORT', 'UNSIGNED');
        }

        if(base instanceof SpriteInterface) {
            base.spriteId = buffer.get('INT');
            base.textureId = buffer.get('SHORT', 'UNSIGNED');
            base.tiled = buffer.get('BYTE', 'UNSIGNED') === 1;
            base.opacity = buffer.get('BYTE', 'UNSIGNED');
        }

        if(base instanceof ModelInterface) {
            base.modelType = 1;
            base.modelId = buffer.get('SHORT', 'UNSIGNED');
            base.offsetX = buffer.get('SHORT');
            base.offsetY = buffer.get('SHORT');
            base.rotationX = buffer.get('SHORT', 'UNSIGNED');
            base.rotationZ = buffer.get('SHORT', 'UNSIGNED');
            base.rotationY = buffer.get('SHORT', 'UNSIGNED');
            base.modelZoom = buffer.get('SHORT', 'UNSIGNED');
            base.animation = buffer.get('SHORT', 'UNSIGNED');
            base.orthogonal = buffer.get('BYTE', 'UNSIGNED') === 1;

            if(base.animation === 65535) {
                base.animation = -1;
            }
            
            if(base.modelId === 65535) {
                base.modelId = -1;
            }
        }

        if(base instanceof LinkInterface) {
            base.fontId = buffer.get('SHORT', 'UNSIGNED');
            base.text = buffer.getString();
            base.lineHeight = buffer.get('BYTE', 'UNSIGNED');
            base.textAlignmentX = buffer.get('BYTE', 'UNSIGNED');
            base.textAlignmentY = buffer.get('BYTE', 'UNSIGNED');
            base.textShadowed = buffer.get('BYTE', 'UNSIGNED') == 1;
            base.textColor = buffer.get('INT');
        }

        if(base instanceof RectangleInterface) {
            base.textColor = buffer.get('INT');
            base.filled = buffer.get('BYTE', 'UNSIGNED') === 1;
            base.opacity = buffer.get('BYTE', 'UNSIGNED');
        }

        if(base instanceof LineInterface) {
            base.lineWidth = buffer.get('BYTE', 'UNSIGNED');
            base.textColor = buffer.get('INT');
        }

        if(base.hasListeners) {
            // @TODO decode listeners
        }

        return base;
    }

    public decodeInterfaceFormat1(interfaceId: number, buffer: ByteBuffer): InterfaceBase {
        buffer = new ByteBuffer(buffer);

        const interfaceType = buffer.get('BYTE');
        const base: InterfaceBase = this.createInterface(interfaceType);

        base.id = interfaceId;
        base.format = 1;

        base.menuType = buffer.get('BYTE', 'UNSIGNED');
        base.contentType = buffer.get('SHORT', 'UNSIGNED');
        base.originalX = buffer.get('SHORT');
        base.originalY = buffer.get('SHORT');
        base.width = buffer.get('SHORT', 'UNSIGNED');
        base.height = buffer.get('SHORT', 'UNSIGNED');
        base.opacity = buffer.get('BYTE', 'UNSIGNED');
        base.parentId = buffer.get('SHORT', 'UNSIGNED');
        base.hoveredSiblingId = buffer.get('SHORT', 'UNSIGNED');

        base.x = base.originalX;
        base.y = base.originalY;

        if(base.parentId === 0xffff) {
            base.parentId = -1;
        }

        if(base.hoveredSiblingId === 0xffff) { // 0xffff === 65535
            base.hoveredSiblingId = -1;
        }

        const alternateCount = buffer.get('BYTE', 'UNSIGNED');

        if(alternateCount > 0) {
            base.alternateOperators = new Array(alternateCount);
            base.alternateRhs = new Array(alternateCount);
            for(let i = 0; alternateCount > i; i++) {
                base.alternateOperators[i] = buffer.get('BYTE', 'UNSIGNED');
                base.alternateRhs[i] = buffer.get('SHORT', 'UNSIGNED');
            }
        }

        const clientScriptCount = buffer.get('BYTE', 'UNSIGNED');

        if(clientScriptCount > 0) {
            base.cs1 = new Array(clientScriptCount);

            for(let csIndex = 0; csIndex < clientScriptCount; csIndex++) {
                const k = buffer.get('SHORT', 'UNSIGNED');
                base.cs1[csIndex] = new Array(k);

                for(let j = 0; k > j; j++) {
                    base.cs1[csIndex][j] = buffer.get('SHORT', 'UNSIGNED');
                    if(base.cs1[csIndex][j] === 65535) {
                        base.cs1[csIndex][j] = -1;
                    }
                }
            }
        }

        if(base instanceof ContainerInterface) {
            base.scrollHeight = buffer.get('SHORT', 'UNSIGNED');
            base.hidden = buffer.get('BYTE', 'UNSIGNED') === 1;
        }

        if(base instanceof TextInterface) {
            buffer.get('SHORT', 'UNSIGNED'); // @TODO look into these at some point
            buffer.get('BYTE', 'UNSIGNED');
        }

        if(base instanceof InteractableItemInterface) {
            base.items = new Array(base.height * base.width);
            base.itemAmounts = new Array(base.height * base.width);
            base.itemSwapable = buffer.get('BYTE', 'UNSIGNED') === 1;
            base.isInventory = buffer.get('BYTE', 'UNSIGNED') === 1;
            base.itemUsable = buffer.get('BYTE', 'UNSIGNED') === 1;
            base.itemDeletesDraged = buffer.get('BYTE', 'UNSIGNED') === 1;
            base.itemSpritePadsX = buffer.get('BYTE', 'UNSIGNED');
            base.itemSpritePadsY = buffer.get('BYTE', 'UNSIGNED');
            base.imageX = new Array(20);
            base.imageY = new Array(20);
            base.images = new Array(20);

            for(let sprite = 0; sprite < 20; sprite++) {
                const hasSprite = buffer.get('BYTE', 'UNSIGNED');
                if(hasSprite === 1) {
                    base.images[sprite] = buffer.get('SHORT');
                    base.imageX[sprite] = buffer.get('SHORT');
                    base.imageY[sprite] = buffer.get('INT');
                } else {
                    base.imageY[sprite] = -1;
                }
            }

            base.options = new Array(5);

            for(let i = 0; i < 5; i++) {
                base.options[i] = buffer.getString();
                if(base.options[i].length === 0) {
                    base.options[i] = null;
                }
            }
        }

        if(base instanceof RectangleInterface) {
            base.filled = buffer.get('BYTE', 'UNSIGNED') === 1;
        }

        if(base instanceof LinkInterface || base instanceof TextInterface) {
            base.textAlignmentX = buffer.get('BYTE', 'UNSIGNED');
            base.textAlignmentY = buffer.get('BYTE', 'UNSIGNED');
            base.lineHeight = buffer.get('BYTE', 'UNSIGNED');
            base.fontId = buffer.get('SHORT', 'UNSIGNED');
            base.textShadowed = buffer.get('BYTE', 'UNSIGNED') === 1;
        }

        if(base instanceof LinkInterface) {
            base.text = buffer.getString();
            base.alternateText = buffer.getString();
        }

        if(base instanceof TextInterface || base instanceof RectangleInterface || base instanceof LinkInterface) {
            base.textColor = buffer.get('INT');
        }

        if(base instanceof RectangleInterface || base instanceof LinkInterface) {
            base.alternateTextColor = buffer.get('INT');
            base.hoveredTextColor = buffer.get('INT');
            base.alternateHoveredTextColor = buffer.get('INT');
        }

        if(base instanceof SpriteInterface) {
            base.spriteId = buffer.get('INT');
            base.alternateSpriteId = buffer.get('INT');
        }

        if(base instanceof ModelInterface) {
            base.modelType = 1;
            base.alternateModelType = 1;
            base.modelId = buffer.get('SHORT', 'UNSIGNED');
            base.alternateModelId = buffer.get('SHORT', 'UNSIGNED');
            base.animation = buffer.get('SHORT', 'UNSIGNED');
            base.alternateAnimation = buffer.get('SHORT', 'UNSIGNED');
            base.modelZoom = buffer.get('SHORT', 'UNSIGNED');
            base.rotationX = buffer.get('SHORT', 'UNSIGNED');
            base.rotationY = buffer.get('SHORT', 'UNSIGNED');

            if(base.modelId === 0xffff) {
                base.modelId = -1;
            }

            if(base.alternateModelId === 0xffff) {
                base.alternateModelId = -1;
            }

            if(base.animation === 0xffff) {
                base.animation = -1;
            }

            if(base.alternateAnimation === 0xffff) {
                base.alternateAnimation = -1;
            }
        }

        if(base instanceof StaticItemInterface) {
            base.items = new Array(base.width * base.height);
            base.itemAmounts = new Array(base.width * base.height);
            base.textAlignmentX = buffer.get('BYTE', 'UNSIGNED');
            base.fontId = buffer.get('SHORT', 'UNSIGNED');
            base.textShadowed = buffer.get('BYTE', 'UNSIGNED') == 1;
            base.textColor = buffer.get('INT');
            base.itemSpritePadsX = buffer.get('SHORT');
            base.itemSpritePadsY = buffer.get('SHORT');
            base.isInventory = buffer.get('BYTE', 'UNSIGNED') == 1;

            base.options = new Array(5);

            for(let i = 0; i < 5; i++) {
                base.options[i] = buffer.getString();
                if(base.options[i].length === 0) {
                    base.options[i] = null;
                }
            }
        }

        if(base instanceof TooltipInterface) {
            base.text = buffer.getString();
        }

        if(base.menuType === 2 || base instanceof InteractableItemInterface) {
            base.targetVerb = buffer.getString();
            base.spellName = buffer.getString();
            base.clickMask = buffer.get('SHORT', 'UNSIGNED');
        }

        if(base.menuType === 1 || base.menuType === 4 || base.menuType === 5 || base.menuType === 6) {
            base.hintText = buffer.getString();

            if(base.hintText.length === 0) {
                if(base.menuType === 1) {
                    base.hintText = 'Ok';
                } else if(base.menuType === 4 || base.menuType === 5) {
                    base.hintText = 'Select';
                } else if(base.menuType === 6) {
                    base.hintText = 'Continue';
                }
            }
        }

        return base;
    }

    private decodeListener(buffer: ByteBuffer): any[] {
        const length = buffer.get('BYTE', 'UNSIGNED');
        if(length === 0) {
            return null;
        }

        const objects: any[] = new Array(length);

        for(let i = 0; i < length; i++) {
            const opcode = buffer.get('BYTE', 'UNSIGNED');
            if(opcode === 0) {
                objects[i] = buffer.get('INT');
            } else if(opcode === 1) {
                objects[i] = buffer.getString();
            }
        }

        return objects;
    }

}
