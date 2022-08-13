import { JagFileStore } from '../../../jag-file-store';
import { JagArchive } from '../../../jag-archive';
import { ByteBuffer } from '@runejs/common';


export class JagGameInterface {
    id: number;
    parentId: number;
    type: number;
    actionType: number;
    contentType: number;
    width: number;
    height: number;
    alpha: number;
    hoveredPopup: number;
    conditionTypes: number[];
    conditionValues: number[];
    cs1Opcodes: number[][];
    scrollLimit: number;
    hiddenUntilHovered: boolean;
    children: number[];
    childrenX: number[];
    childrenY: number[];
    unknownServerAttribute1: number;
    unknownServerAttribute2: boolean;
    items: number[];
    itemAmounts: number[];
    itemsSwappable: boolean;
    isInventory: boolean;
    itemsUsable: boolean;
    deleteDraggedItems: boolean;
    itemSpritesPadX: number;
    itemSpritesPadY: number;
    images: string[];
    imagesX: number[];
    imagesY: number[];
    options: string[];
    filled: boolean;
    textCentered: boolean;
    fontType: number;
    textShadowed: boolean;
    disabledText: string;
    enabledText: string;
    disabledColor: number;
    enabledColor: number;
    disabledHoverColor: number;
    enabledHoverColor: number;
    disabledImage: string;
    enabledImage: string;
    disabledModelType: number;
    disabledModelId: number;
    enabledModelType: number;
    enabledModelId: number;
    disabledAnimationId: number;
    enabledAnimationId: number;
    modelZoom: number;
    modelRotationX: number;
    modelRotationY: number;
    actionAdditions: string;
    actionText: string;
    actionAttributes: number;
    tooltip: string;
}


export class InterfaceArchive {

    readonly jagStore: JagFileStore;
    readonly interfaces: Map<number, JagGameInterface>;
    readonly archive: JagArchive;

    constructor(jagStore: JagFileStore) {
        this.jagStore = jagStore;
        this.interfaces = new Map<number, JagGameInterface>();
        this.archive = this.jagStore.getIndex('archives')
            .getArchive('interface.jag');
    }

    decode(data: ByteBuffer): JagGameInterface {
        const gameInterface = new JagGameInterface();
        gameInterface.id = data.get('short', 'unsigned');

        if (gameInterface.id === 65535) {
            gameInterface.parentId = data.get('short', 'unsigned');
            gameInterface.id = data.get('short', 'unsigned');
        }

        const type = gameInterface.type = data.get('byte', 'unsigned');
        gameInterface.actionType = data.get('byte', 'unsigned');
        gameInterface.contentType = data.get('short', 'unsigned');
        const width = gameInterface.width = data.get('short', 'unsigned');
        const height = gameInterface.height = data.get('short', 'unsigned');
        gameInterface.alpha = data.get('byte', 'unsigned');
        gameInterface.hoveredPopup = data.get('byte', 'unsigned');

        if (gameInterface.hoveredPopup !== 0) {
            gameInterface.hoveredPopup = (gameInterface.hoveredPopup - 1 << 8) +
                data.get('byte', 'unsigned'); // why?
        } else {
            gameInterface.hoveredPopup = -1;
        }

        const conditionCount = data.get('byte', 'unsigned');

        if (conditionCount > 0) {
            gameInterface.conditionTypes = new Array(conditionCount);
            gameInterface.conditionValues = new Array(conditionCount);

            for (let i = 0; i < conditionCount; i++) {
                gameInterface.conditionTypes[i] = data.get('byte', 'unsigned');
                gameInterface.conditionValues[i] = data.get('short', 'unsigned');
            }
        }

        const cs1OpcodeCount = data.get('byte', 'unsigned');

        if (cs1OpcodeCount > 0) {
            gameInterface.cs1Opcodes = new Array(cs1OpcodeCount);

            for (let i = 0; i < cs1OpcodeCount; i++) {
                const cs1BlockCount = data.get('short', 'unsigned');
                gameInterface.cs1Opcodes[i] = new Array(cs1BlockCount);

                for (let j = 0; j < cs1BlockCount; j++) {
                    gameInterface.cs1Opcodes[i][j] = data.get('short', 'unsigned');
                }
            }
        }

        if (type === 0) {
            gameInterface.scrollLimit = data.get('short', 'unsigned');
            gameInterface.hiddenUntilHovered = data.get('byte', 'unsigned') === 1;

            const childCount = data.get('short', 'unsigned');

            gameInterface.children = new Array(childCount);
            gameInterface.childrenX = new Array(childCount);
            gameInterface.childrenY = new Array(childCount);

            for (let i = 0; i < childCount; i++) {
                gameInterface.children[i] = data.get('short', 'unsigned');
                gameInterface.childrenX[i] = data.get('short');
                gameInterface.childrenY[i] = data.get('short');
            }
        }

        if (type === 1) {
            gameInterface.unknownServerAttribute1 = data.get('short', 'unsigned');
            gameInterface.unknownServerAttribute2 = data.get('byte', 'unsigned') === 1;
        }

        if (type === 2) {
            gameInterface.items = new Array(width * height);
            gameInterface.itemAmounts = new Array(width * height);
            gameInterface.itemsSwappable = data.get('byte', 'unsigned') === 1;
            gameInterface.isInventory = data.get('byte', 'unsigned') === 1;
            gameInterface.itemsUsable = data.get('byte', 'unsigned') === 1;
            gameInterface.deleteDraggedItems = data.get('byte', 'unsigned') === 1;
            gameInterface.itemSpritesPadX = data.get('byte', 'unsigned');
            gameInterface.itemSpritesPadY = data.get('byte', 'unsigned');
            gameInterface.images = new Array(20);
            gameInterface.imagesX = new Array(20);
            gameInterface.imagesY = new Array(20);

            for (let i = 0; i < 20; i++) {
                const hasSprite = data.get('byte', 'unsigned') === 1;
                if (hasSprite) {
                    gameInterface.imagesX[i] = data.get('short');
                    gameInterface.imagesY[i] = data.get('short');
                    gameInterface.images[i] = data.getString(10);
                }
            }

            gameInterface.options = new Array(5);

            for (let i = 0; i < 5; i++) {
                gameInterface.options[i] = data.getString(10);
            }
        }

        if (type === 3) {
            gameInterface.filled = data.get('byte', 'unsigned') === 1;
        }

        if (type === 4 || type === 1) {
            gameInterface.textCentered = data.get('byte', 'unsigned') === 1;
            gameInterface.fontType = data.get('byte', 'unsigned');
            gameInterface.textShadowed = data.get('byte', 'unsigned') === 1;
        }

        if (type === 4) {
            gameInterface.disabledText = data.getString(10);
            gameInterface.enabledText = data.getString(10);
        }

        if (gameInterface.type === 1 || gameInterface.type === 3 || gameInterface.type === 4) {
            gameInterface.disabledColor = data.get('int');
        }

        if (gameInterface.type === 3 || gameInterface.type === 4) {
            gameInterface.enabledColor = data.get('int');
            gameInterface.disabledHoverColor = data.get('int');
            gameInterface.enabledHoverColor = data.get('int');
        }

        if (gameInterface.type === 5) {
            gameInterface.disabledImage = data.getString(10);
            gameInterface.enabledImage= data.getString(10);
        }

        if (gameInterface.type === 6) {
            let identifier = data.get('byte', 'unsigned');

            if (identifier !== 0) {
                gameInterface.disabledModelType = 1;
                gameInterface.disabledModelId = (identifier - 1 << 8) + data.get('byte', 'unsigned');
            }

            identifier = data.get('byte', 'unsigned');

            if (identifier !== 0) {
                gameInterface.enabledModelType = 1;
                gameInterface.enabledModelId = (identifier - 1 << 8) + data.get('byte', 'unsigned');
            }

            identifier = data.get('byte', 'unsigned');

            if (identifier !== 0) {
                gameInterface.disabledAnimationId = (identifier - 1 << 8) + data.get('byte', 'unsigned');
            } else {
                gameInterface.disabledAnimationId = -1;
            }

            identifier = data.get('byte', 'unsigned');

            if (identifier !== 0) {
                gameInterface.enabledAnimationId = (identifier - 1 << 8) + data.get('byte', 'unsigned');
            } else {
                gameInterface.enabledAnimationId = -1;
            }

            gameInterface.modelZoom = data.get('short', 'unsigned');
            gameInterface.modelRotationX = data.get('short', 'unsigned');
            gameInterface.modelRotationY = data.get('short', 'unsigned');
        }

        if (gameInterface.type === 7) {
            gameInterface.items = new Array(width * height);
            gameInterface.itemAmounts = new Array(width * height);
            gameInterface.textCentered = data.get('byte', 'unsigned') === 1;
            gameInterface.fontType = data.get('byte', 'unsigned');
            gameInterface.textShadowed = data.get('byte', 'unsigned') === 1;
            gameInterface.disabledColor = data.get('int');
            gameInterface.itemSpritesPadX = data.get('short');
            gameInterface.itemSpritesPadY = data.get('short');
            gameInterface.isInventory = data.get('byte', 'unsigned') === 1;
            gameInterface.options = new Array(5);

            for (let i = 0; i < 5; i++) {
                gameInterface.options[i] = data.getString(10);
            }
        }

        if (gameInterface.type === 8) {
            gameInterface.disabledText = data.getString(10);
        }

        if (gameInterface.actionType === 2 || gameInterface.type === 2) {
            gameInterface.actionAdditions = data.getString(10);
            gameInterface.actionText = data.getString(10);
            gameInterface.actionAttributes = data.get('short', 'unsigned');
        }

        if (gameInterface.actionType === 1 || gameInterface.actionType === 4 || gameInterface.actionType === 5 || gameInterface.actionType === 6) {
            gameInterface.tooltip = data.getString(10);
        }

        return gameInterface;
    }

    decodeAll(): void {
        const dataFile = this.archive.getFile('data');
        if (!dataFile?.index?.data) {
            throw new Error('interface.jag data file is not loaded!');
        }

        const data = new ByteBuffer(dataFile.index.data);
        this.interfaces.clear();

        while (data.readerIndex < data.length) {
            const gameInterface = this.decode(data);
            this.interfaces.set(gameInterface.id, gameInterface);
        }
    }

}
