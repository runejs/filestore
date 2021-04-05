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

            if(opcode == 1) {
                const length = buffer.get('BYTE', 'UNSIGNED');
                npcConfig.model.models = new Array(length);
                for(let idx = 0; idx < length; ++idx) {
                    npcConfig.model.models[idx] = buffer.get('SHORT', 'UNSIGNED');
                }
            } else if(opcode == 2) {
                npcConfig.name = buffer.getString();
            } else if(opcode == 12) {
                npcConfig.rendering.boundary = buffer.get('BYTE', 'UNSIGNED');
            } else if(opcode == 13) {
                npcConfig.animations.stand = buffer.get('SHORT', 'UNSIGNED');
            } else if(opcode == 14) {
                npcConfig.animations.walk = buffer.get('SHORT', 'UNSIGNED');
            } else if(opcode == 15) {
                buffer.get('SHORT', 'UNSIGNED'); // junk
            } else if(opcode == 16) {
                buffer.get('SHORT', 'UNSIGNED'); // junk
            } else if(opcode == 17) {
                npcConfig.animations.walk = buffer.get('SHORT', 'UNSIGNED');
                npcConfig.animations.turnAround = buffer.get('SHORT', 'UNSIGNED');
                npcConfig.animations.turnRight = buffer.get('SHORT', 'UNSIGNED');
                npcConfig.animations.turnLeft = buffer.get('SHORT', 'UNSIGNED');
            } else if(opcode >= 30 && opcode < 35) {
                if(!npcConfig.options) {
                    npcConfig.options = new Array(10).fill(null);
                }
                npcConfig.options[opcode - 30] = buffer.getString();
                if(npcConfig.options[opcode - 30] === 'Hidden') {
                    npcConfig.options[-30 + opcode] = null;
                }
            } else if(opcode == 40) {
                // Model color replacement
                const length = buffer.get('BYTE', 'UNSIGNED');
                for(let i = 0; i < length; i++) {
                    buffer.get('SHORT', 'UNSIGNED');
                    buffer.get('SHORT', 'UNSIGNED');
                }
            } else if(opcode == 60) {
                const length = buffer.get('BYTE', 'UNSIGNED');
                npcConfig.model.headModels = new Array(length);
                for(let i = 0; length > i; i++) {
                    npcConfig.model.headModels[i] = buffer.get('SHORT', 'UNSIGNED');
                }
            } else if(opcode == 93) {
                npcConfig.minimapVisible = false;
            } else if(opcode == 95) {
                npcConfig.combatLevel = buffer.get('SHORT', 'UNSIGNED');
            } else if(opcode == 97) {
                npcConfig.rendering.sizeX = buffer.get('SHORT', 'UNSIGNED');
            } else if(opcode == 98) {
                npcConfig.rendering.sizeY = buffer.get('SHORT', 'UNSIGNED');
            } else if(opcode == 99) {
                npcConfig.rendering.renderPriority = true;
            } else if(opcode == 100) {
                const ambient = buffer.get('BYTE');
            } else if(opcode == 101) {
                const contrast = (buffer.get('BYTE')) * 5;
            } else if(opcode == 102) {
                npcConfig.headIcon = (buffer.get('SHORT', 'UNSIGNED'));
            } else if(opcode == 103) {
                npcConfig.turnDegrees = (buffer.get('SHORT', 'UNSIGNED'));
            } else if(opcode == 106) {
                let varBitId = buffer.get('SHORT', 'UNSIGNED');
                let settingId = buffer.get('SHORT', 'UNSIGNED');
                if(varBitId == 65535) varBitId = -1;
                if(settingId == 65535) settingId = -1;
                const childCount = buffer.get('BYTE', 'UNSIGNED');
                for(let i = 0; childCount >= i; i++) {
                    buffer.get('SHORT', 'UNSIGNED'); // child id
                }
            } else if(opcode == 107) {
                npcConfig.clickable = false;
            }
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
