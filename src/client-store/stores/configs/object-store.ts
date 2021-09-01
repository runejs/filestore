import { logger } from '@runejs/core';
import { ClientFileGroup } from '../../client-file-group';
import { ConfigStore } from '../config-store';
import { ClientFile } from '../../client-file';
import { FileGroup, FlatFile, IndexedFile } from '../../../file-store';


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
    walkable: boolean;
    configChangeDest?: number[];
    configId: number = -1;
    varbitId: number = -1;
    supportsItems: boolean = false;

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
        objectModels?: number[];
        objectModelTypes?: number[];
        ambient: number;
        contrast: number;
        recolorToReplace?: number[];
        recolorToFind?: number[];
        rotated: boolean;
        castsShadow: boolean;
        modelSizeX: number;
        modelSizeY: number;
        modelSizeHeight: number;
        mapSceneID: number;
        obstructsGround: boolean;
        hollow: boolean;
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
        sizeY: 1,
        hollow: false,
        obstructsGround: false,
        mapSceneID: -1,
        modelSizeY: 128,
        modelSizeHeight: 128,
        modelSizeX: 128,
        castsShadow: true,
        rotated: false,
        contrast: 0,
        ambient: 0
    };
    icon?: number;
    wall: boolean = false;

}


/**
 * Controls files within the Object Archive of the configuration index.
 */
export class ObjectStore {

    /**
     * The game object group, containing details about every game object.
     */
    private _objectGroup: ClientFileGroup | FileGroup;

    public constructor(private configStore: ConfigStore) {
    }

    /**
     * Decodes every object file within the object archive and returns
     * the resulting ObjectConfig array.
     */
    public decodeObjectStore(): Map<number, ObjectConfig> {
        const group = this.objectGroup;

        if(!group) {
            logger.error(`Object archive not found.`);
            return null;
        }

        const objectMap: Map<number, ObjectConfig> = new Map<number, ObjectConfig>();

        for(const [ objectId, objectFile ] of group.files) {
            if(!objectFile) {
                logger.error(`Object file not found.`);
                continue;
            }

            objectMap.set(objectId, this.decodeObjectFile(objectFile));
        }

        return objectMap;
    }

    /**
     * Fetches the ObjectConfig object for the specified object game id.
     * @param objectId The game id of the object to find.
     */
    public getObject(objectId: number): ObjectConfig | null {
        const group = this.objectGroup;

        if(!group) {
            logger.error(`Object archive not found.`);
            return null;
        }

        const objectFile: ClientFile | FlatFile | null = group.files.get(objectId) || null;

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
    public decodeObjectFile(objectFile: ClientFile | FlatFile): ObjectConfig {
        const objectConfig = new ObjectConfig();
        const buffer = objectFile.fileData;
        let runLoop = true;

        objectConfig.gameId = objectFile.fileIndex;

        while(runLoop) {
            const opcode = buffer.get('BYTE', 'UNSIGNED');
            if(opcode === 0) {
                runLoop = false;
                break;
            }

            if(opcode === 1) {
                const length = buffer.get('BYTE', 'UNSIGNED');
                if(length > 0) {
                    if(objectConfig.rendering.objectModels == null) {
                        objectConfig.rendering.objectModels = [];
                        objectConfig.rendering.objectModelTypes = [];
                        for(let index = 0; length > index; index++) {
                            objectConfig.rendering.objectModels[index] = buffer.get('SHORT', 'UNSIGNED'); // model id
                            objectConfig.rendering.objectModelTypes[index] = buffer.get('BYTE', 'UNSIGNED'); // model type
                        }
                    } else {
                        buffer.readerIndex += length * 3;
                    }
                }
            } else if(opcode === 2) {
                objectConfig.name = buffer.getString();
            } else if(opcode === 5) {
                const length = buffer.get('BYTE', 'UNSIGNED');
                if(length > 0) {
                    if(objectConfig.rendering.objectModels == null) {
                        objectConfig.rendering.objectModels = [];
                        objectConfig.rendering.objectModelTypes = null;
                        for(let index = 0; length > index; index++) {
                            objectConfig.rendering.objectModels[index] = buffer.get('SHORT', 'UNSIGNED'); // model id
                        }
                    } else {
                        buffer.readerIndex += length * 2;
                    }
                }
            } else if(opcode === 14) {
                objectConfig.rendering.sizeX = buffer.get('BYTE', 'UNSIGNED');
            } else if(opcode === 15) {
                objectConfig.rendering.sizeY = buffer.get('BYTE', 'UNSIGNED');
            } else if(opcode === 17) {
                objectConfig.solid = false;
            } else if(opcode === 18) {
                objectConfig.walkable = false;
            } else if(opcode === 19) {
                objectConfig.hasOptions = buffer.get('BYTE', 'UNSIGNED') === 1;
            } else if(opcode === 21) {
                objectConfig.rendering.adjustToTerrain = true;
            } else if(opcode === 22) {
                objectConfig.rendering.nonFlatShading = true;
            } else if(opcode === 23) {
                objectConfig.wall = true;
            } else if(opcode === 24) {
                objectConfig.rendering.animationId = buffer.get('SHORT', 'UNSIGNED');
                if(objectConfig.rendering.animationId == 0xFFFF) {
                    objectConfig.rendering.animationId = -1;
                }
            } else if(opcode === 28) {
                buffer.get('BYTE', 'UNSIGNED');
            } else if(opcode === 29) {
                objectConfig.rendering.ambient = buffer.get('BYTE');
            } else if(opcode === 39) {
                objectConfig.rendering.contrast = 5 * buffer.get('BYTE');
            } else if(opcode >= 30 && opcode < 35) {
                if(!objectConfig.options) {
                    objectConfig.options = new Array(5).fill(null);
                }

                const option = buffer.getString();
                objectConfig.options[opcode - 30] = option.toLowerCase() === 'hidden' ? null : option;
            } else if(opcode === 40) {
                const length = buffer.get('BYTE', 'UNSIGNED');
                objectConfig.rendering.recolorToFind = [];
                objectConfig.rendering.recolorToReplace = [];
                for(let index = 0; index < length; index++) {
                    objectConfig.rendering.recolorToFind[index] = (buffer.get('SHORT', 'UNSIGNED')); // old color
                    objectConfig.rendering.recolorToReplace[index] = (buffer.get('SHORT', 'UNSIGNED')); // new color
                }
            } else if(opcode === 60) {
                objectConfig.icon = (buffer.get('SHORT', 'UNSIGNED')); // ??
            } else if(opcode === 62) {
                objectConfig.rendering.rotated = true;
            } else if(opcode === 64) {
                objectConfig.rendering.castsShadow = false;
            } else if(opcode === 65) {
                objectConfig.rendering.modelSizeX = (buffer.get('SHORT', 'UNSIGNED')); // modelSizeX
            } else if(opcode === 66) {
                objectConfig.rendering.modelSizeHeight = (buffer.get('SHORT', 'UNSIGNED')); // modelSizeHeight
            } else if(opcode === 67) {
                objectConfig.rendering.modelSizeY = (buffer.get('SHORT', 'UNSIGNED')); // modelSizeY
            } else if(opcode === 68) {
                objectConfig.rendering.mapSceneID = (buffer.get('SHORT', 'UNSIGNED')); // mapSceneID
            } else if(opcode === 69) {
                objectConfig.rendering.face = buffer.get('BYTE', 'UNSIGNED');
            } else if(opcode === 70) {
                objectConfig.rendering.translateX = (buffer.get('SHORT'));
            } else if(opcode === 71) {
                objectConfig.rendering.translateY = (buffer.get('SHORT'));
            } else if(opcode === 72) {
                objectConfig.rendering.translateLevel = (buffer.get('SHORT'));
            } else if(opcode === 73) {
                objectConfig.rendering.obstructsGround = true;
            } else if(opcode === 74) {
                objectConfig.rendering.hollow = true;
            } else if(opcode === 75) {
                objectConfig.supportsItems = buffer.get('BYTE', 'UNSIGNED') === 1; // anInt2533
            } else if(opcode === 77) {
                objectConfig.varbitId = buffer.get('SHORT', 'UNSIGNED'); // varbit id
                if(objectConfig.varbitId == 0xffff) {
                    objectConfig.varbitId = -1;
                }
                objectConfig.configId = buffer.get('SHORT', 'UNSIGNED'); // settings id
                if(objectConfig.configId == 0xFFFF) {
                    objectConfig.configId = -1;
                }
                const length = buffer.get('BYTE', 'UNSIGNED');
                objectConfig.configChangeDest = [];
                for(let index = 0; index <= length; ++index) {
                    objectConfig.configChangeDest[index] = buffer.get('SHORT', 'UNSIGNED');
                    if(0xFFFF == objectConfig.configChangeDest[index]) {
                        objectConfig.configChangeDest[index] = -1;
                    }

                }
            } else if(opcode === 78) {
                buffer.get('SHORT', 'UNSIGNED'); // anInt2513
                buffer.get('BYTE', 'UNSIGNED'); // anInt2502
            } else if(opcode === 79) {
                buffer.get('SHORT', 'UNSIGNED'); // anInt2499
                buffer.get('SHORT', 'UNSIGNED'); // anInt2542
                buffer.get('BYTE', 'UNSIGNED'); // anInt2502
                const length = buffer.get('BYTE', 'UNSIGNED');
                for(let index = 0; index < length; ++index) {
                    buffer.get('SHORT', 'UNSIGNED'); // anIntArray2523[index]
                }
            }
        }

        buffer.readerIndex = 0;
        return objectConfig;
    }

    public get objectGroup(): ClientFileGroup | FileGroup {
        if(!this._objectGroup) {
            this._objectGroup = this.configStore.getGroup('objects');
        }
        return this._objectGroup;
    }

}