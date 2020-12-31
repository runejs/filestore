import { Archive } from '../../archive';
import { ConfigStore } from '../config-store';


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

}
