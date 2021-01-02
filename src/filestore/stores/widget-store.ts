import { FileIndex } from '../file-index';
import { Filestore } from '../filestore';
import { ByteBuffer } from '@runejs/core';


// old interface from rune-js/cache-parser vvv
export class Widget {

    parentId: number;
    type: number;
    format: number = 2;

    originalX: number;
    originalY: number;
    x: number;
    y: number;
    width: number;
    height: number;

    menuType: number;
    contentType: number;
    opacity: number;
    hidden: boolean;
    scrollHeight: number;
    hoveredSiblingId: number;
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
    filled: boolean;
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
    spriteId: number;
    alternateSpriteId: number;
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
    offsetX2d: number;
    offsetY2d: number;
    orthogonal: boolean;
    targetVerb: string;
    spellName: string;
    clickMask: number;
    hintText: string;

    alternateOperators: number[];
    alternateRhs: number[];
    cs1: number[][];

    public constructor(public id: number) {
    }

}




export abstract class WidgetBase {

    id: number;
    parentId: number;
    type: number;
    format: number;
    originalX: number;
    originalY: number;
    x: number;
    y: number;
    width: number;
    height: number;
    menuType: number;
    contentType: number;
    opacity: number;
    hidden: boolean;
    hoveredSiblingId: number;
    alternateOperators: number[];
    alternateRhs: number[];
    cs1: number[][];

}

export class ContainerWidget extends WidgetBase {

    type: number = 0;
    scrollHeight: number;

}

export class TextWidget extends WidgetBase {

    type: number = 1;

}

export class FancyItemWidget extends WidgetBase {

    type: number = 2;

}

export class ButtonWidget extends WidgetBase {

    type: number = 3;

}

export class LinkWidget extends WidgetBase {

    type: number = 4;

}

export class SpriteWidget extends WidgetBase {

    type: number = 5;

}

export class ModelWidget extends WidgetBase {

    type: number = 6;

}

export class SimpleItemWidget extends WidgetBase {

    type: number = 7;

}

export class TooltipWidget extends WidgetBase {

    type: number = 8;

}


/**
 * Controls game interface widget file format and storage.
 */
export class WidgetStore {

    /**
     * The main file index of the widget store.
     */
    public readonly widgetFileIndex: FileIndex;

    public constructor(private fileStore: Filestore) {
        this.widgetFileIndex = fileStore.getIndex('widgets');
    }

    public decodeWidget(): void {
        // if isIf1 then call decodeSimpleWidget()
        // else...
        // decode if3 here
    }

    public decodeWidgetFormat2(widgetId: number, buffer: ByteBuffer): void {

    }

    public decodeWidgetFormat1(widgetId: number, buffer: ByteBuffer): Widget {
        buffer = new ByteBuffer(buffer);


        const widgetType = buffer.get('BYTE');

        let w: WidgetBase;

        if(widgetType === 0) {
            w = new ContainerWidget();
        } else if(widgetType === 1) {
            w = new TextWidget();
        } else if(widgetType === 2) {
            w = new FancyItemWidget();
        } else if(widgetType === 3) {
            w = new ButtonWidget();
        } else if(widgetType === 4) {
            w = new LinkWidget();
        } else if(widgetType === 5) {
            w = new SpriteWidget();
        } else if(widgetType === 6) {
            w = new ModelWidget();
        } else if(widgetType === 7) {
            w = new SimpleItemWidget();
        } else if(widgetType === 8) {
            w = new TooltipWidget();
        }

        w.format = 1;

        w.menuType = buffer.get('BYTE', 'UNSIGNED');
        w.contentType = buffer.get('SHORT', 'UNSIGNED');
        w.originalX = buffer.get('SHORT');
        w.originalY = buffer.get('SHORT');
        w.width = buffer.get('SHORT', 'UNSIGNED');
        w.height = buffer.get('SHORT', 'UNSIGNED');
        w.opacity = buffer.get('BYTE', 'UNSIGNED');
        w.parentId = buffer.get('SHORT', 'UNSIGNED');
        w.hoveredSiblingId = buffer.get('SHORT', 'UNSIGNED');

        w.x = w.originalX;
        w.y = w.originalY;

        if(w.parentId === 0xFFFF) {
            w.parentId = -1;
        }

        if(w.hoveredSiblingId === 0xFFFF) { // 0xFFFF === 65535
            w.hoveredSiblingId = -1;
        }

        const alternateCount = buffer.get('BYTE', 'UNSIGNED');

        if(alternateCount > 0) {
            w.alternateOperators = new Array(alternateCount);
            w.alternateRhs = new Array(alternateCount);
            for(let i = 0; alternateCount > i; i++) {
                w.alternateOperators[i] = buffer.get('BYTE', 'UNSIGNED');
                w.alternateRhs[i] = buffer.get('SHORT', 'UNSIGNED');
            }
        }

        const clientScriptCount = buffer.get('BYTE', 'UNSIGNED');

        if(clientScriptCount > 0) {
            w.cs1 = new Array(clientScriptCount);

            for(let csIndex = 0; csIndex < clientScriptCount; csIndex++) {
                const k = buffer.get('SHORT', 'UNSIGNED');
                w.cs1[csIndex] = new Array(k);

                for(let j = 0; k > j; j++) {
                    w.cs1[csIndex][j] = buffer.get('SHORT', 'UNSIGNED');
                    if(w.cs1[csIndex][j] === 65535) {
                        w.cs1[csIndex][j] = -1;
                    }
                }
            }
        }

        if(w.type === 0) { // container
            w.scrollHeight = buffer.get('SHORT', 'UNSIGNED');
            w.hidden = buffer.get('BYTE', 'UNSIGNED') === 1;
        }

        if(widget.type === 1) { // wot
            buffer.get('SHORT', 'UNSIGNED'); // @TODO look into these at some point
            buffer.get('BYTE', 'UNSIGNED');
        }

        if(widget.type === 2) { // item container
            widget.items = new Array(widget.height * widget.width);
            widget.itemAmounts = new Array(widget.height * widget.width);
            widget.itemSwapable = buffer.get('BYTE', 'UNSIGNED') === 1;
            widget.isInventory = buffer.get('BYTE', 'UNSIGNED') === 1;
            widget.itemUsable = buffer.get('BYTE', 'UNSIGNED') === 1;
            widget.itemDeletesDraged = buffer.get('BYTE', 'UNSIGNED') === 1;
            widget.itemSpritePadsX = buffer.get('BYTE', 'UNSIGNED');
            widget.itemSpritePadsY = buffer.get('BYTE', 'UNSIGNED');
            widget.imageX = new Array(20);
            widget.imageY = new Array(20);
            widget.images = new Array(20);

            for(let sprite = 0; sprite < 20; sprite++) {
                const hasSprite = buffer.get('BYTE', 'UNSIGNED');
                if(hasSprite === 1) {
                    widget.images[sprite] = buffer.get('SHORT');
                    widget.imageX[sprite] = buffer.get('SHORT');
                    widget.imageY[sprite] = buffer.get('INT');
                } else {
                    widget.imageY[sprite] = -1;
                }
            }

            widget.options = new Array(5);

            for(let i = 0; i < 5; i++) {
                widget.options[i] = buffer.getString();
                if(widget.options[i].length === 0) {
                    widget.options[i] = null;
                }
            }
        }

        if(widget.type === 3) {
            widget.filled = buffer.get('BYTE', 'UNSIGNED') === 1;
        }

        if(widget.type === 4 || widget.type === 1) {
            widget.textAlignmentX = buffer.get('BYTE', 'UNSIGNED');
            widget.textAlignmentY = buffer.get('BYTE', 'UNSIGNED');
            widget.lineHeight = buffer.get('BYTE', 'UNSIGNED');
            widget.fontId = buffer.get('SHORT', 'UNSIGNED');
            widget.textShadowed = buffer.get('BYTE', 'UNSIGNED') === 1;
        }

        if(widget.type === 4) {
            widget.text = buffer.getString();
            widget.alternateText = buffer.getString();
        }

        if(widget.type === 1 || widget.type === 3 || widget.type === 4) {
            widget.textColor = buffer.get('INT');
        }

        if(widget.type === 3 || widget.type === 4) {
            widget.alternateTextColor = buffer.get('INT');
            widget.hoveredTextColor = buffer.get('INT');
            widget.alternateHoveredTextColor = buffer.get('INT');
        }

        if(widget.type === 5) { // sprite
            widget.spriteId = buffer.get('INT');
            widget.alternateSpriteId = buffer.get('INT');
        }

        if(widget.type === 6) { // model
            widget.modelType = 1;
            widget.alternateModelType = 1;
            widget.modelId = buffer.get('SHORT', 'UNSIGNED');
            widget.alternateModelId = buffer.get('SHORT', 'UNSIGNED');
            widget.animation = buffer.get('SHORT', 'UNSIGNED');
            widget.alternateAnimation = buffer.get('SHORT', 'UNSIGNED');
            widget.modelZoom = buffer.get('SHORT', 'UNSIGNED');
            widget.rotationX = buffer.get('SHORT', 'UNSIGNED');
            widget.rotationY = buffer.get('SHORT', 'UNSIGNED');

            if(widget.modelId === 0xFFFF) {
                widget.modelId = -1;
            }

            if(widget.alternateModelId === 0xFFFF) {
                widget.alternateModelId = -1;
            }

            if(widget.animation === 0xFFFF) {
                widget.animation = -1;
            }

            if(widget.alternateAnimation === 0xFFFF) {
                widget.alternateAnimation = -1;
            }
        }

        if(widget.type === 7) {
            widget.items = new Array(widget.width * widget.height);
            widget.itemAmounts = new Array(widget.width * widget.height);
            widget.textAlignmentX = buffer.get('BYTE', 'UNSIGNED');
            widget.fontId = buffer.get('SHORT', 'UNSIGNED');
            widget.textShadowed = buffer.get('BYTE', 'UNSIGNED') == 1;
            widget.textColor = buffer.get('INT');
            widget.itemSpritePadsX = buffer.get('SHORT');
            widget.itemSpritePadsY = buffer.get('SHORT');
            widget.isInventory = buffer.get('BYTE', 'UNSIGNED') == 1;

            widget.options = new Array(5);

            for(let i = 0; i < 5; i++) {
                widget.options[i] = buffer.getString();
                if(widget.options[i].length === 0) {
                    widget.options[i] = null;
                }
            }
        }

        if(widget.type === 8) {
            widget.text = buffer.getString();
        }

        if(widget.menuType === 2 || widget.type === 2) {
            widget.targetVerb = buffer.getString();
            widget.spellName = buffer.getString();
            widget.clickMask = buffer.get('SHORT', 'UNSIGNED');
        }

        if(widget.menuType === 1 || widget.menuType === 4 || widget.menuType === 5 || widget.menuType === 6) {
            widget.hintText = buffer.getString();

            if(widget.hintText.length === 0) {
                if(widget.menuType === 1) {
                    widget.hintText = 'Ok';
                } else if(widget.menuType === 4 || widget.menuType === 5) {
                    widget.hintText = 'Select';
                } else if(widget.menuType === 6) {
                    widget.hintText = 'Continue';
                }
            }
        }

        return widget;
    }

}
