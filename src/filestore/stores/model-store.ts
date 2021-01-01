import { Filestore } from '../filestore';
import { FileIndex } from '../file-index';


export class RsModel {

    id: number;

}


/**
 * Controls model file storage.
 */
export class ModelStore {

    private readonly modelFileIndex: FileIndex;

    public constructor(private fileStore: Filestore) {
        this.modelFileIndex = this.fileStore.getIndex('models');
    }

    public getModel(id: number): void {
        const file = this.modelFileIndex.getFile(id) || null;
        // @TODO
    }

}
