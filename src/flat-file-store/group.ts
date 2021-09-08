import { StoreFileBase } from '@runejs/js5';
import { ByteBuffer } from '@runejs/core/buffer';
import { FlatFileStore } from './flat-file-store';
import { Archive } from './archive';
import { File } from './file';


export class Group extends StoreFileBase {

    public readonly store: FlatFileStore;
    public readonly archive: Archive;
    public readonly files: Map<string, File>;

    public constructor(index: string | number, archive: Archive) {
        super(index);
        this.archive = archive;
        this.store = archive.store;
        this.files = new Map<string, File>();
    }

    public encode(): ByteBuffer {
        if(this.files.size > 1) {
            const fileData: Buffer[] = Array.from(this.files.values())
                .map(file => file?.data?.toNodeBuffer() ?? null);
            const fileSizes = fileData.map(data => data?.length ?? 0);
            const fileCount = fileSizes.length;

            // Size of all individual files + 1 int per file containing it's size + 1 at the end for the number of stripes
            const groupSize = fileCount ? fileSizes.reduce((a, c) => a + c) + (fileCount * 4) + 1 : 0;

            if(groupSize < 1) {
                return undefined;
            }

            const groupBuffer = new ByteBuffer(groupSize + 1);

            // Write individual file contents
            for(let i = 0; i < fileCount; i++) {
                if(fileData[i]) {
                    // Stripes
                    groupBuffer.putBytes(fileData[i]);
                }
            }

            // Write individual file sizes
            let prevLen: number = 0;
            for(const fileSize of fileSizes) {
                // Stripe length
                // Stripe length is the full length of the file for the server-side
                groupBuffer.put(fileSize - prevLen, 'int');
                prevLen = fileSize;
            }

            // Write stripe count
            // Stripe count should always be 1 for the server-side
            groupBuffer.put(1);

            this.setData(groupBuffer.flipWriter(), false);
        } else {
            this.setData(this.files.get('0').data, false);
        }

        return this._data;
    }

    public compress(): ByteBuffer {
        this.encode();
        return super.compress();
    }

}
