import { ByteBuffer } from '@runejs/core/buffer';
import { IndexManifest } from './index-manifest';


export class ArchiveFile {

    public constructor(public readonly indexManifest: IndexManifest,
                       public fileId: number,
                       public fileData?: ByteBuffer | undefined) {
    }

}
