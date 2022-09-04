import { Buffer } from 'buffer';
import { ByteBuffer, logger } from '@runejs/common';
import { JagFileStore } from '../../../jag-file-store';
import { JagGameInterfaceEntity } from '../../../../../db/jag';


export class JagInterfaceArchive {

    readonly jagStore: JagFileStore;
    readonly interfaces: Map<number, JagGameInterfaceEntity>;

    constructor(jagStore: JagFileStore) {
        this.jagStore = jagStore;
        this.interfaces = new Map<number, JagGameInterfaceEntity>();
    }

    decode(data: ByteBuffer): JagGameInterfaceEntity {
        const inter = new JagGameInterfaceEntity();
        inter.id = data.get('short', 'unsigned');

        if (inter.id === 65535) {
            inter.parentId = data.get('short', 'unsigned');
            inter.id = data.get('short', 'unsigned');
        }

        const type = inter.type = data.get('byte', 'unsigned');
        inter.actionType = data.get('byte', 'unsigned');
        inter.contentType = data.get('short', 'unsigned');
        const width = inter.width = data.get('short', 'unsigned');
        const height = inter.height = data.get('short', 'unsigned');
        inter.alpha = data.get('byte', 'unsigned');

        // hoveredPopup = u_short, but only a single u_byte is written if there is no hovered popup
        // use u_smart_short ?
        inter.hoveredPopup = data.get('byte', 'unsigned');
        if (inter.hoveredPopup !== 0) {
            inter.hoveredPopup = (inter.hoveredPopup - 1 << 8) +
                data.get('byte', 'unsigned'); // why?
        } else {
            inter.hoveredPopup = -1;
        }

        const conditionCount = data.get('byte', 'unsigned');

        if (conditionCount > 0) {
            inter.conditionTypes = new Array(conditionCount);
            inter.conditionValues = new Array(conditionCount);

            for (let i = 0; i < conditionCount; i++) {
                inter.conditionTypes[i] = data.get('byte', 'unsigned');
                inter.conditionValues[i] = data.get('short', 'unsigned');
            }
        }

        const cs1OpcodeCount = data.get('byte', 'unsigned');

        if (cs1OpcodeCount > 0) {
            inter.cs1Opcodes = new Array(cs1OpcodeCount);

            for (let i = 0; i < cs1OpcodeCount; i++) {
                const cs1BlockCount = data.get('short', 'unsigned');
                inter.cs1Opcodes[i] = new Array(cs1BlockCount);

                for (let j = 0; j < cs1BlockCount; j++) {
                    inter.cs1Opcodes[i][j] = data.get('short', 'unsigned');
                }
            }
        }

        if (type === 0) {
            inter.scrollLimit = data.get('short', 'unsigned');
            inter.hiddenUntilHovered = data.get('byte', 'unsigned') === 1;

            const childCount = data.get('short', 'unsigned');

            inter.children = new Array(childCount);
            inter.childrenX = new Array(childCount);
            inter.childrenY = new Array(childCount);

            for (let i = 0; i < childCount; i++) {
                inter.children[i] = data.get('short', 'unsigned');
                inter.childrenX[i] = data.get('short');
                inter.childrenY[i] = data.get('short');
            }
        }

        if (type === 1) {
            inter.unknownServerAttribute1 = data.get('short', 'unsigned');
            inter.unknownServerAttribute2 = data.get('byte', 'unsigned') === 1;
        }

        if (type === 2) {
            inter.items = new Array(width * height);
            inter.itemAmounts = new Array(width * height);
            inter.itemsSwappable = data.get('byte', 'unsigned') === 1;
            inter.isInventory = data.get('byte', 'unsigned') === 1;
            inter.itemsUsable = data.get('byte', 'unsigned') === 1;
            inter.deleteDraggedItems = data.get('byte', 'unsigned') === 1;
            inter.itemSpritesPadX = data.get('byte', 'unsigned');
            inter.itemSpritesPadY = data.get('byte', 'unsigned');
            inter.images = new Array(20);
            inter.imagesX = new Array(20);
            inter.imagesY = new Array(20);

            for (let i = 0; i < 20; i++) {
                const hasSprite = data.get('byte', 'unsigned') === 1;
                if (hasSprite) {
                    inter.imagesX[i] = data.get('short');
                    inter.imagesY[i] = data.get('short');
                    inter.images[i] = data.getString(10);
                }
            }

            inter.options = new Array(5);

            for (let i = 0; i < 5; i++) {
                inter.options[i] = data.getString(10);
            }
        }

        if (type === 3) {
            inter.filled = data.get('byte', 'unsigned') === 1;
        }

        if (type === 4 || type === 1) {
            inter.textCentered = data.get('byte', 'unsigned') === 1;
            inter.fontType = data.get('byte', 'unsigned');
            inter.textShadowed = data.get('byte', 'unsigned') === 1;
        }

        if (type === 4) {
            inter.disabledText = data.getString(10);
            inter.enabledText = data.getString(10);
        }

        if (inter.type === 1 || inter.type === 3 || inter.type === 4) {
            inter.disabledColor = data.get('int');
        }

        if (inter.type === 3 || inter.type === 4) {
            inter.enabledColor = data.get('int');
            inter.disabledHoverColor = data.get('int');
            inter.enabledHoverColor = data.get('int');
        }

        if (inter.type === 5) {
            inter.disabledImage = data.getString(10);
            inter.enabledImage = data.getString(10);
        }

        if (inter.type === 6) {
            let identifier = data.get('byte', 'unsigned');

            if (identifier !== 0) {
                inter.disabledModelType = 1;
                inter.disabledModelId = (identifier - 1 << 8) + data.get('byte', 'unsigned');
            }

            identifier = data.get('byte', 'unsigned');

            if (identifier !== 0) {
                inter.enabledModelType = 1;
                inter.enabledModelId = (identifier - 1 << 8) + data.get('byte', 'unsigned');
            }

            identifier = data.get('byte', 'unsigned');

            if (identifier !== 0) {
                inter.disabledAnimationId = (identifier - 1 << 8) + data.get('byte', 'unsigned');
            } else {
                inter.disabledAnimationId = -1;
            }

            identifier = data.get('byte', 'unsigned');

            if (identifier !== 0) {
                inter.enabledAnimationId = (identifier - 1 << 8) + data.get('byte', 'unsigned');
            } else {
                inter.enabledAnimationId = -1;
            }

            inter.modelZoom = data.get('short', 'unsigned');
            inter.modelRotationX = data.get('short', 'unsigned');
            inter.modelRotationY = data.get('short', 'unsigned');
        }

        if (inter.type === 7) {
            inter.items = new Array(width * height);
            inter.itemAmounts = new Array(width * height);
            inter.textCentered = data.get('byte', 'unsigned') === 1;
            inter.fontType = data.get('byte', 'unsigned');
            inter.textShadowed = data.get('byte', 'unsigned') === 1;
            inter.disabledColor = data.get('int');
            inter.itemSpritesPadX = data.get('short');
            inter.itemSpritesPadY = data.get('short');
            inter.isInventory = data.get('byte', 'unsigned') === 1;
            inter.options = new Array(5);

            for (let i = 0; i < 5; i++) {
                inter.options[i] = data.getString(10);
            }
        }

        if (inter.type === 8) {
            inter.disabledText = data.getString(10);
        }

        if (inter.actionType === 2 || inter.type === 2) {
            inter.actionAdditions = data.getString(10);
            inter.actionText = data.getString(10);
            inter.actionAttributes = data.get('short', 'unsigned');
        }

        if (inter.actionType === 1 || inter.actionType === 4 || inter.actionType === 5 || inter.actionType === 6) {
            inter.tooltip = data.getString(10);
        }

        return inter;
    }

    async decodeAll(): Promise<void> {
        const archive = this.jagStore.getCache('archives')
            .getArchive('interface.jag');

        if (!archive) {
            throw new Error('interface.jag archive is not loaded!');
        }

        const dataFile = archive.getFile('data');

        await dataFile.loadUncompressedData();

        if (!dataFile?.data?.buffer?.length) {
            throw new Error('interface.jag data file is not loaded!');
        }

        const data = new ByteBuffer(dataFile.data.buffer);
        this.interfaces.clear();

        data.get('short', 'unsigned'); // interface count

        while (data.readerIndex < data.length) {
            try {
                const gameInterface = this.decode(data);
                this.interfaces.set(gameInterface.id, gameInterface);
            } catch (e) {
                logger.error(e);
                break;
            }
        }
    }

    encode(gameInterface: JagGameInterfaceEntity): Buffer | null {
        // @todo stubbed - 15/08/22 - Kiko
        return null;
    }

    encodeAll(): Buffer | null {
        // @todo stubbed - 15/08/22 - Kiko
        return null;
    }

    toJS5(gameInterface: JagGameInterfaceEntity): null {
        // @todo stubbed - 15/08/22 - Kiko
        return null;
    }

    async loadAll(): Promise<void> {
        const entities = (await this.jagStore.database.interfaceRepo.find())
            .sort((a, b) => a.id - b.id);
        entities.forEach(entity => this.interfaces.set(entity.id, entity));
    }

    async saveAll(): Promise<void> {
        await this.jagStore.database.saveInterfaces(Array.from(this.interfaces.values()));
    }

}
