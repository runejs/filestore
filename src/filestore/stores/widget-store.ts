import { FileIndex } from '../file-index';
import { Filestore } from '../filestore';


/**
 * Controls game interface widget file format and storage.
 */
export class WidgetStore {

    /**
     * The main file index of the widget store.
     */
    public readonly widgetFileIndex: FileIndex;

    public constructor(private fileStore: Filestore) {
        this.widgetFileIndex = fileStore.getIndex('widgets');
    }

    public decodeWidget(): void {
        // if isIf1 then call decodeSimpleWidget()
        // else...
        // decode if3 here
    }

    public decodeSimpleWidget(): void {
        // "if1"
    }

}
