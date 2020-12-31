import { Archive } from '../../archive';
import { ConfigStore } from '../config-store';


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

}
