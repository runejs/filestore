import { Archive } from '../../archive';
import { ConfigStore } from '../config-store';
import { FileData } from '../../file-data';
import { logger } from '@runejs/core';


/**
 * Contains game client need-to-know level information about a single game npc.
 */
export class NpcConfig {

    gameId: number;
    name: string | null = null;
    animations: {
        stand: number;
        walk: number;
        turnAround: number;
        turnRight: number;
        turnLeft: number;
    } = {
        stand: -1,
        walk: -1,
        turnAround: -1,
        turnRight: -1,
        turnLeft: -1
    };
    options?: string[];
    minimapVisible: boolean = true;
    combatLevel: number = -1;
    headIcon: number = -1;
    clickable: boolean = true;
    turnDegrees: number = 32;

    /**
     * 3d modelling information for this npc.
     */
    model: {
        models?: number[];
        headModels?: number[];
    } = {
    };

    /**
     * Additional rendering details.
     */
    rendering: {
        boundary: number;
        sizeX: number;
        sizeY: number;
        renderPriority: boolean;
    } = {
        boundary: 1,
        sizeX: 128,
        sizeY: 128,
        renderPriority: false
    };

}


/**
 * Controls files within the NPC Archive of the configuration index.
 */
export class NpcStore {

    /**
     * The NPC Archive, containing details about every game NPC.
     */
    public readonly npcArchive: Archive;

    public constructor(private configStore: ConfigStore) {
        this.npcArchive = this.configStore.getArchive('npcs');
    }

    /**
     * Fetches the NpcConfig object for the specified npc game id.
     * @param npcId The game id of the npc to find.
     */
    public getNpc(npcId: number): NpcConfig | null {
        const npcArchive = this.npcArchive;

        if(!npcArchive) {
            logger.error(`Npc archive not found.`);
            return null;
        }

        const npcFile = npcArchive.getFile(npcId) || null;

        if(!npcFile) {
            logger.error(`Npc file not found.`);
            return null;
        }

        return this.decodeNpcFile(npcFile);
    }

    /**
     * Parses a raw npc data file into a readable NpcConfig object.
     * @param npcFile The raw file-store npc data.
     */
    public decodeNpcFile(npcFile: FileData): NpcConfig {
        const npcConfig = new NpcConfig();

        const buffer = npcFile.content;
        npcConfig.gameId = npcFile.fileId;

        while(true) {
            const opcode = buffer.get('BYTE', 'UNSIGNED');
            if(opcode === 0) {
                break;
            }

            // @TODO decode the file
        }

        return npcConfig;
    }

    /**
     * Decodes every npc file within the npc archive and returns
     * the resulting NpcConfig array.
     */
    public decodeNpcStore(): NpcConfig[] {
        if(!this.npcArchive) {
            logger.error(`Npc archive not found.`);
            return null;
        }

        const npcCount = this.npcArchive.files.size;
        const npcList: NpcConfig[] = new Array(npcCount);

        for(let npcId = 0; npcId < npcCount; npcId++) {
            const npcFile = this.npcArchive.getFile(npcId) || null;

            if(!npcFile) {
                logger.error(`Npc file not found.`);
                return null;
            }

            npcList[npcId] = this.decodeNpcFile(npcFile);
        }

        return npcList;
    }

}
