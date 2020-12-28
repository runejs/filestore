import { FileIndex } from '../file-index';
import { Filestore } from '../filestore';


export class WidgetStore {

    public readonly widgetFileIndex: FileIndex;

    public constructor(private fileStore: Filestore) {
        this.widgetFileIndex = fileStore.getIndex('widgets');
    }

    public decodeWidget(): void {

    }

    public decodeStandardWidget(): void {
        // "if1"
    }

    public decodeScriptedWidget(): void {
        // "if3"
    }

}
