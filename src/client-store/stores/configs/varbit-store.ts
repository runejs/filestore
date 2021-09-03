import { logger } from '@runejs/core';
import { ClientFileGroup } from '../../client-file-group';
import { ConfigStore } from '../config-store';
import { ClientFile } from '../../client-file';
import { FileGroup, FlatFile } from '../../../file-store';


/**
 * Contains game client need-to-know level information about a single varbit.
 */
export class VarbitConfig {
    gameId: number;
    index: number;
    leastSignificantBit: number;
    mostSignificantBit: number;
}


/**
 * Controls files within the Varbit Archive of the configuration index.
 */
export class VarbitStore {

    /**
     * The Varbit group, containing details about every game varbit.
     */
    private _varbitGroup: ClientFileGroup | FileGroup;

    public constructor(private configStore: ConfigStore) {
    }

    /**
     * Fetches the VarbitConfig object for the specified varbit id.
     * @param varbitId The id of the varbit to find.
     */
    public getVarbit(varbitId: number): VarbitConfig | null {
        const varbitArchive = this.varbitGroup;

        if(!varbitArchive) {
            logger.error(`Varbit archive not found.`);
            return null;
        }

        const varbitFile = varbitArchive.getFile(varbitId) || null;

        if(!varbitFile) {
            logger.error(`Varbit file not found.`);
            return null;
        }

        return this.decodeVarbitFile(varbitFile);
    }

    /**
     * Parses a raw varbit data file into a readable VarbitConfig object.
     * @param varbitFile The raw file-store varbit data.
     */
    public decodeVarbitFile(varbitFile: ClientFile | FlatFile): VarbitConfig {
        const varbitConfig = new VarbitConfig();

        const buffer = varbitFile.fileData;
        let runLoop = true;

        varbitConfig.gameId = varbitFile.fileIndex;

        while(runLoop) {
            const opcode = buffer.get('byte', 'unsigned');

            if(opcode === 0) {
                runLoop = false;
                break;
            } else if(opcode === 1) {
                varbitConfig.index = buffer.get('short', 'unsigned');
                varbitConfig.leastSignificantBit = buffer.get('byte', 'unsigned');
                varbitConfig.mostSignificantBit = buffer.get('byte', 'unsigned');
            }
        }

        buffer.readerIndex = 0;
        return varbitConfig;
    }

    /**
     * Decodes every varbit file within the varbit archive and returns
     * the resulting VarbitConfig array.
     */
    public decodeVarbitStore(): Map<string, VarbitConfig> {
        if(!this.varbitGroup) {
            logger.error(`Varbit archive not found.`);
            return null;
        }

        const varbitMap: Map<string, VarbitConfig> = new Map<string, VarbitConfig>();

        for(const [ varbitId, varbitFile ] of this.varbitGroup.files) {
            if(!varbitFile) {
                logger.error(`Varbit file not found.`);
                return null;
            }

            varbitMap.set(varbitId, this.decodeVarbitFile(varbitFile));
        }

        return varbitMap;
    }

    public get varbitGroup(): ClientFileGroup | FileGroup {
        if(!this._varbitGroup) {
            this._varbitGroup = this.configStore.getGroup('varbits');
        }
        return this._varbitGroup;
    }

}
