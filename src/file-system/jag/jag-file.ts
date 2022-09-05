import { JagFileStore } from './jag-file-store';
import { JagFileBase } from './jag-file-base';


export class JagFile extends JagFileBase {

    constructor(jagStore: JagFileStore, fileKey: number, cacheKey: number, archiveKey: number = -1) {
        super(jagStore, 'FILE', fileKey, cacheKey, archiveKey);
    }

}
