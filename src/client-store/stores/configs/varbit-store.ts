import { logger } from '@runejs/core';
import { ClientFileGroup } from '../../client-file-group';
import { ConfigStore } from '../config-store';
import { ClientFile } from '../../client-file';


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
     * The Varbit Archive, containing details about every game varbit.
     */
    public readonly varbitArchive: ClientFileGroup;

    public constructor(private configStore: ConfigStore) {
        this.varbitArchive = this.configStore.getArchive('varbits');
    }

    /**
     * Fetches the VarbitConfig object for the specified varbit game id.
     * @param varbitId The game id of the varbit to find.
     */
    public getVarbit(varbitId: number): VarbitConfig | null {
        const varbitArchive = this.varbitArchive;

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
    public decodeVarbitFile(varbitFile: ClientFile): VarbitConfig {
        const varbitConfig = new VarbitConfig();

        const buffer = varbitFile.content;
        varbitConfig.gameId = varbitFile.fileId;

        while(true) {
            const opcode = buffer.get('BYTE', 'UNSIGNED');
            if(opcode === 0) {
                break;
            }
            if(opcode === 1) {
                varbitConfig.index = buffer.get('SHORT', 'UNSIGNED');
                varbitConfig.leastSignificantBit = buffer.get('BYTE', 'UNSIGNED');
                varbitConfig.mostSignificantBit = buffer.get('BYTE', 'UNSIGNED');
            }
        }

        varbitFile.content.readerIndex = 0;
        return varbitConfig;
    }

    /**
     * Decodes every varbit file within the varbit archive and returns
     * the resulting VarbitConfig array.
     */
    public decodeVarbitStore(): VarbitConfig[] {
        if(!this.varbitArchive) {
            logger.error(`Varbit archive not found.`);
            return null;
        }

        const varbitCount = this.varbitArchive.files.size;
        const varbitList: VarbitConfig[] = new Array(varbitCount);

        for(let varbitId = 0; varbitId < varbitCount; varbitId++) {
            const varbitFile = this.varbitArchive.getFile(varbitId) || null;

            if(!varbitFile) {
                logger.error(`Varbit file not found.`);
                return null;
            }

            varbitList[varbitId] = this.decodeVarbitFile(varbitFile);
        }

        return varbitList;
    }

}
