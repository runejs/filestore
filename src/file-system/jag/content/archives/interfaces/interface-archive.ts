import { JagFileStore } from '../../../jag-file-store';
import { JagArchive } from '../../../jag-archive';


export interface JagGameInterface {
    key: number;
}


export class InterfaceArchive {

    readonly jagStore: JagFileStore;
    readonly interfaces: Map<number, JagGameInterface>;
    readonly archive: JagArchive;

    constructor(jagStore: JagFileStore) {
        this.jagStore = jagStore;
        this.interfaces = new Map<number, JagGameInterface>();
        this.archive = this.jagStore.getIndex('archives')
            .getArchive('interface.jag');
    }

    decodeAll(): void {
        //@todo stopped here - 12/08/22 - Kiko
    }

}
