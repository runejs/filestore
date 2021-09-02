import { ClientStoreChannel, loadClientStore } from './data';
import { ClientArchive } from './client-archive';
import {
    BinaryStore,
    ConfigStore,
    FontStore,
    ItemStore,
    JingleStore,
    ModelStore,
    MusicStore,
    NpcStore,
    ObjectStore,
    RegionStore,
    SoundStore,
    SpriteStore,
    TextureStore,
    VarbitStore,
    InterfaceStore,
    XteaDefinition
} from './stores';
import { archiveConfig, ArchiveName, IndexName } from '../file-store';
import { DecompressionOptions } from './decompression/decompression-options';


export class ClientFileStore {

    public readonly filestoreDir: string;
    public readonly configDir: string;

    public readonly binaryStore: BinaryStore;
    public readonly configStore: ConfigStore;
    public readonly fontStore: FontStore;
    public readonly jingleStore: JingleStore;
    public readonly modelStore: ModelStore;
    public readonly musicStore: MusicStore;
    public readonly regionStore: RegionStore;
    public readonly soundStore: SoundStore;
    public readonly spriteStore: SpriteStore;
    public readonly widgetStore: InterfaceStore;
    public readonly textureStore: TextureStore;

    public readonly channels: ClientStoreChannel;

    public readonly indexes = new Map<number, ClientArchive>();

    public readonly xteaKeys: { [key: number]: XteaDefinition };

    public constructor(
            filestoreDir: string,
            options?: {
                configDir?: string,
                xteaKeys?: { [key: number]: XteaDefinition }
            }
        ) {
        this.filestoreDir = filestoreDir;
        this.configDir = options?.configDir || filestoreDir;
        this.xteaKeys = options?.xteaKeys || {};
        this.channels = loadClientStore(filestoreDir);

        this.binaryStore = new BinaryStore(this);
        this.configStore = new ConfigStore(this);
        this.fontStore = new FontStore(this);
        this.jingleStore = new JingleStore(this);
        this.modelStore = new ModelStore(this);
        this.musicStore = new MusicStore(this);
        this.regionStore = new RegionStore(this, options?.xteaKeys);
        this.soundStore = new SoundStore(this);
        this.spriteStore = new SpriteStore(this);
        this.widgetStore = new InterfaceStore(this);
        this.textureStore = new TextureStore(this);

        // this should be called as-needed
        // this.fontStore.loadFonts();
    }

    /**
     * Fetches the specified indexed archive.
     * @param archiveIndex The numeric index of the archive to find.
     */
    public getArchive(archiveIndex: number): ClientArchive;

    /**
     * Fetches the specified indexed archive.
     * @param archiveName The name of the archive to find.
     */
    public getArchive(archiveName: IndexName): ClientArchive;

    /**
     * Fetches the specified indexed archive.
     * @param archiveIndexOrName The string or numeric index of the archive to find.
     */
    public getArchive(archiveIndexOrName: number | IndexName): ClientArchive {
        let archiveIndex: number;
        if(typeof archiveIndexOrName !== 'number') {
            archiveIndex = archiveConfig[archiveIndexOrName].index;
        } else {
            archiveIndex = archiveIndexOrName;
        }

        if(!this.indexes.has(archiveIndex)) {
            const index = new ClientArchive(this, archiveIndex, this.channels);
            index.decodePackedArchive();
            this.indexes.set(archiveIndex, index);
            return index;
        } else {
            return this.indexes.get(archiveIndex);
        }
    }

    public async decompressArchives(options?: DecompressionOptions): Promise<void> {
        await Promise.all(this.getAllArchives().map(archive => archive.decompressArchive(options)));
    }

    public getAllArchives(): ClientArchive[] {
        const archiveNames: ArchiveName[] = Object.keys(archiveConfig)
            .filter(name => name !== 'main') as ArchiveName[];
        return archiveNames.map(archiveName => this.getArchive(archiveConfig[archiveName].index));
    }

    public get itemStore(): ItemStore {
        return this.configStore?.itemStore;
    }

    public get varbitStore(): VarbitStore {
        return this.configStore?.varbitStore;
    }

    public get npcStore(): NpcStore {
        return this.configStore?.npcStore;
    }

    public get objectStore(): ObjectStore {
        return this.configStore?.objectStore;
    }

}
