import { Js5Archive, Js5Store } from '@runejs/js5';
import { DecompressionOptions } from '../client-store/decompression/decompression-options';


export class Js5Decompressor {

    public readonly store: Js5Store;
    public readonly options: DecompressionOptions;

    public constructor(store: Js5Store, options?: DecompressionOptions) {
        this.store = store;
        this.options = DecompressionOptions.create(options);
    }

    public decompressStore(): void {
        this.store.decode();

        for(const [ archiveIndex, archive ] of this.store.archives) {
            if(archiveIndex && archive && archiveIndex !== '255') {
                this.decompressArchive(archiveIndex, archive);
            }
        }
    }

    public decompressArchive(archiveName: string): void;
    public decompressArchive(archiveIndex: string, archive: Js5Archive): void;
    public decompressArchive(archiveId: string, archive?: Js5Archive): void {
        if(!archive) {
            archive = this.store.getArchive(archiveId);
            archive.decode();
        }

        const archiveInfo = this.store.config.getArchiveInfo(archiveId);
        const { debug } = this.options;

        console.log(archive.groups.size);
    }

}
