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

            // @TODO decode the file
        }

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
