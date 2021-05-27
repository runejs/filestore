import { ByteBuffer } from '@runejs/core/buffer';
import { IndexManifest } from '../index-manifest';


export class IndexedFile {

    public constructor(public readonly indexManifest: IndexManifest,
                       public fileId: number,
                       public fileData?: ByteBuffer | undefined) {
    }

}
