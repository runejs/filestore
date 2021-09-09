import { StoreFileBase } from '@runejs/js5';
import { ByteBuffer } from '@runejs/core/buffer';
import { FlatFileStore } from './flat-file-store';
import { Archive } from './archive';
import { File } from './file';


export class Group extends StoreFileBase {

    public readonly store: FlatFileStore;
    public readonly archive: Archive;
    public readonly files: Map<string, File>;

    private _encoded: boolean;

    public constructor(index: string | number, archive: Archive) {
        super(index);
        this.archive = archive;
        this.store = archive.store;
        this.files = new Map<string, File>();
        this._encoded = false;
    }

    public encode(): ByteBuffer {
        if(this._encoded) {
            return this._data;
        }

        if(this.files.size > 1) {
            const fileData: ByteBuffer[] = Array.from(this.files.values()).map(file => file?.data ?? new ByteBuffer(0));
            const fileSizes = fileData.map(data => data.length);
            const fileCount = fileSizes.length;
            const stripeCount = this.stripeCount ?? 1;

            if(!stripeCount) {
                return null;
            }

            // Size of all individual files + 1 int per file containing it's size
            // + 1 at the end for the total group stripe count
            const groupSize = fileSizes.reduce((a, c) => a + c) + (stripeCount * fileCount * 4) + 1;
            const groupBuffer = new ByteBuffer(groupSize);

            fileData.forEach(data => data.readerIndex = 0);

            // Write file content stripes
            for(let stripe = 0; stripe < stripeCount; stripe++) {
                for(const [ , file ] of this.files) {
                    const stripeSize = file.stripeSizes[stripe];

                    if(stripeSize) {
                        const stripeData = file.data.getSlice(file.data.readerIndex, stripeSize);
                        file.data.readerIndex = file.data.readerIndex + stripeSize;
                        groupBuffer.putBytes(stripeData);
                    }
                }
            }

            for(let stripe = 0; stripe < stripeCount; stripe++) {
                let prevSize = 0;
                for(const [ , file ] of this.files) {
                    const stripeSize = file.stripeSizes[stripe] ?? 0;
                    groupBuffer.put(stripeSize - prevSize, 'int');
                    prevSize = stripeSize;
                }
            }

            groupBuffer.put(this.stripeCount, 'byte');

            this.setData(groupBuffer.flipWriter(), false);
        }

        this._encoded = true;
        return this._data;
    }

    public compress(): ByteBuffer {
        this.encode();
        return this.data?.length ? super.compress() : null;
    }

    public get encoded(): boolean {
        return this._encoded;
    }
}
