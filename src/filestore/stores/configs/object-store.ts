import { Archive } from '../../archive';
import { ConfigStore } from '../config-store';
import { FileData } from '../../file-data';
import { logger } from '@runejs/core';


/**
 * Contains game client need-to-know level information about a single game object.
 */
export class ObjectConfig {

    gameId: number;
    name: string | null = null;

    solid: boolean = true;
    nonWalkable: boolean = true;
    hasOptions: boolean = false;
    options: string[];
    aBoolean2528: boolean;

    /**
     * 3d modelling information for this object.
     */
    model: {
        models?: number[];
    } = {
    };

    /**
     * Additional rendering details.
     */
    rendering: {
        adjustToTerrain: boolean;
        nonFlatShading: boolean;
        animationId: number;
        face: number;
        translateX: number;
        translateY: number;
        translateLevel: number;
        sizeX: number;
        sizeY: number;
    } = {
        face: 0,
        translateX: 0,
        translateY: 0,
        translateLevel: 0,
        adjustToTerrain: false,
        nonFlatShading: false,
        animationId: -1,
        sizeX: 1,
        sizeY: 1
    };

}


/**
 * Controls files within the Object Archive of the configuration index.
 */
export class ObjectStore {

    /**
     * The Object Archive, containing details about every game object.
     */
    public readonly objectArchive: Archive;

    public constructor(private configStore: ConfigStore) {
        this.objectArchive = this.configStore.getArchive('objects');
    }

    /**
     * Fetches the ObjectConfig object for the specified object game id.
     * @param objectId The game id of the object to find.
     */
    public getObject(objectId: number): ObjectConfig | null {
        const objectArchive = this.objectArchive;

        if(!objectArchive) {
            logger.error(`Object archive not found.`);
            return null;
        }

        const objectFile = objectArchive.getFile(objectId) || null;

        if(!objectFile) {
            logger.error(`Object file not found.`);
            return null;
        }

        return this.decodeObjectFile(objectFile);
    }

    /**
     * Parses a raw game object data file into a readable ObjectConfig object.
     * @param objectFile The raw file-store game object data.
     */
    public decodeObjectFile(objectFile: FileData): ObjectConfig {
        const objectConfig = new ObjectConfig();

        const buffer = objectFile.content;
        objectConfig.gameId = objectFile.fileId;

        while(true) {
            const opcode = buffer.get('BYTE', 'UNSIGNED');
            if(opcode === 0) {
                break;
            }

            if(opcode == 1) {
                const length = buffer.get('BYTE', 'UNSIGNED');
                if(length > 0) {
                    for(let index = 0; length > index; index++) {
                        buffer.get('SHORT', 'UNSIGNED'); // model id
                        buffer.get('BYTE', 'UNSIGNED'); // model type
                    }
                }
            } else if(opcode == 2) {
                objectConfig.name = buffer.getString();
            } else if(opcode == 5) {
                const length = buffer.get('BYTE', 'UNSIGNED');
                if(length > 0) {
                    for(let index = 0; length > index; index++) {
                        buffer.get('SHORT', 'UNSIGNED'); // model id
                    }
                }
            } else if(opcode == 14) {
                objectConfig.rendering.sizeX = buffer.get('BYTE', 'UNSIGNED');
            } else if(opcode == 15) {
                objectConfig.rendering.sizeY = buffer.get('BYTE', 'UNSIGNED');
            } else if(opcode == 17) {
                objectConfig.solid = false;
            } else if(opcode == 18) {
                objectConfig.aBoolean2528 = false;
            } else if(opcode == 19) {
                objectConfig.hasOptions = buffer.get('BYTE', 'UNSIGNED') === 1;
            } else if(opcode == 21) {
                objectConfig.rendering.adjustToTerrain = true;
            } else if(opcode == 22) {
                objectConfig.rendering.nonFlatShading = true;
            } else if(opcode == 23) {
                // def.unknownBoolean = true;
            } else if(opcode == 24) {
                objectConfig.rendering.animationId = buffer.get('SHORT', 'UNSIGNED');
                if(objectConfig.rendering.animationId == 0xFFFF) {
                    objectConfig.rendering.animationId = -1;
                }
            } else if(opcode == 28) {
                buffer.get('BYTE', 'UNSIGNED');
            } else if(opcode == 29) {
                const ambient = buffer.get('BYTE');
            } else if(opcode == 39) {
                const contrast = 5 * buffer.get('BYTE');
            } else if(opcode >= 30 && opcode < 35) {
                if(!objectConfig.options) {
                    objectConfig.options = new Array(5).fill(null);
                }

                const option = buffer.getString();
                objectConfig.options[opcode - 30] = option.toLowerCase() === 'hidden' ? null : option;
            } else if(opcode == 40) {
                const length = buffer.get('BYTE', 'UNSIGNED');
                for(let index = 0; index < length; index++) {
                    (buffer.get('SHORT', 'UNSIGNED')); // old color
                    (buffer.get('SHORT', 'UNSIGNED')); // new color
                }
            } else if(opcode == 60) {
                (buffer.get('SHORT', 'UNSIGNED')); // ??
            } else if(opcode == 62) {
                // aBoolean2553 = true;
            } else if(opcode == 64) {
                // aBoolean2541 = false;
            } else if(opcode == 65) {
                (buffer.get('SHORT', 'UNSIGNED')); // modelSizeX
            } else if(opcode == 66) {
                (buffer.get('SHORT', 'UNSIGNED')); // modelSizeHeight
            } else if(opcode == 67) {
                (buffer.get('SHORT', 'UNSIGNED')); // modelSizeY
            } else if(opcode == 68) {
                (buffer.get('SHORT', 'UNSIGNED')); // mapSceneID
            } else if(opcode == 69) {
                objectConfig.rendering.face = buffer.get('BYTE', 'UNSIGNED');
            } else if(opcode == 70) {
                objectConfig.rendering.translateX = (buffer.get('SHORT'));
            } else if(opcode == 71) {
                objectConfig.rendering.translateY = (buffer.get('SHORT'));
            } else if(opcode == 72) {
                objectConfig.rendering.translateLevel = (buffer.get('SHORT'));
            } else if(opcode == 73) {
                // unknown = true;
            } else if(opcode == 74) {
                // isSolid = true;
            } else if(opcode == 75) {
                buffer.get('BYTE', 'UNSIGNED'); // anInt2533
            } else if(opcode == 77) {
                buffer.get('SHORT', 'UNSIGNED'); // varbit id
                buffer.get('SHORT', 'UNSIGNED'); // settings id
                const length = buffer.get('BYTE', 'UNSIGNED');
                for(let index = 0; index <= length; ++index) {
                    buffer.get('SHORT', 'UNSIGNED');
                }
            } else if(opcode == 78) {
                buffer.get('SHORT', 'UNSIGNED'); // anInt2513
                buffer.get('BYTE', 'UNSIGNED'); // anInt2502
            } else if(opcode == 79) {
                buffer.get('SHORT', 'UNSIGNED'); // anInt2499
                buffer.get('SHORT', 'UNSIGNED'); // anInt2542
                buffer.get('BYTE', 'UNSIGNED'); // anInt2502
                const length = buffer.get('BYTE', 'UNSIGNED');
                for(let index = 0; index < length; ++index) {
                    buffer.get('SHORT', 'UNSIGNED'); // anIntArray2523[index]
                }
            }
        }

        objectFile.content.readerIndex = 0;
        return objectConfig;
    }

    /**
     * Decodes every object file within the object archive and returns
     * the resulting ObjectConfig array.
     */
    public decodeObjectStore(): ObjectConfig[] {
        if(!this.objectArchive) {
            logger.error(`Object archive not found.`);
            return null;
        }

        const objectCount = this.objectArchive.files.size;
        const objectList: ObjectConfig[] = new Array(objectCount);

        for(let objectId = 0; objectId < objectCount; objectId++) {
            const objectFile = this.objectArchive.getFile(objectId) || null;

            if(!objectFile) {
                logger.error(`Object file not found.`);
                return null;
            }

            objectList[objectId] = this.decodeObjectFile(objectFile);
        }

        return objectList;
    }

}
