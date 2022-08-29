import { Inject, Injectable } from '@decorators/di';
import { FILESTORE_DIR } from '../config';
import { Js5FileStore } from '../../file-system';
import { Js5IndexEntity } from '../../db/js5';
import { logger } from '@runejs/common';
import { Buffer } from 'buffer';


@Injectable()
export class Js5Service {

    readonly stores: Map<string | number, Js5FileStore>;

    constructor(
        @Inject(FILESTORE_DIR) private fileStoreDir: string
    ) {
        this.stores = new Map<string | number, Js5FileStore>();
        logger.info('Js5Service initialized');
    }

    async getArchiveGroupFileData(
        gameBuild: string | number,
        archiveIdentifier: string | number,
        groupIdentifier: string | number,
        fileIdentifier: string | number
    ): Promise<Buffer> {
        const fileStore = await this.getFileStore(gameBuild);
        const archive = await fileStore.getArchive(archiveIdentifier);
        const group = await archive.getGroup(groupIdentifier);
        const file = await group.getFile(fileIdentifier);
        return file.index.compressedData;
    }

    async getArchiveGroupFile(
        gameBuild: string | number,
        archiveIdentifier: string | number,
        groupIdentifier: string | number,
        fileIdentifier: string | number
    ): Promise<Js5IndexEntity> {
        const fileStore = await this.getFileStore(gameBuild);
        const archive = await fileStore.getArchive(archiveIdentifier);
        const group = await archive.getGroup(groupIdentifier);
        const file = await group.getFile(fileIdentifier);

        const index = { ...file.index };
        delete index.data;
        delete index.compressedData;

        return index;
    }

    async getArchiveGroupFileList(
        gameBuild: string | number,
        archiveIdentifier: string | number,
        groupIdentifier: string | number
    ): Promise<Js5IndexEntity[]> {
        const fileStore = await this.getFileStore(gameBuild);
        const archive = await fileStore.getArchive(archiveIdentifier);
        const group = await archive.getGroup(groupIdentifier);

        await group.loadFileIndexes();

        const files = Array.from(group.files.values());
        const results: Js5IndexEntity[] = new Array(files.length);

        for (let i = 0; i < files.length; i++) {
            results[i] = { ...files[i].index };
            delete results[i].data;
            delete results[i].compressedData;
        }

        return results;
    }

    async getArchiveGroupData(
        gameBuild: string | number,
        archiveIdentifier: string | number,
        groupIdentifier: string | number
    ): Promise<Buffer> {
        const fileStore = await this.getFileStore(gameBuild);
        const archive = await fileStore.getArchive(archiveIdentifier);
        const group = await archive.getGroup(groupIdentifier);
        return group.index.compressedData;
    }

    async getArchiveGroup(
        gameBuild: string | number,
        archiveIdentifier: string | number,
        groupIdentifier: string | number
    ): Promise<Js5IndexEntity> {
        const fileStore = await this.getFileStore(gameBuild);
        const archive = await fileStore.getArchive(archiveIdentifier);
        const group = await archive.getGroup(groupIdentifier);

        const index = { ...group.index };
        delete index.data;
        delete index.compressedData;

        return index;
    }

    async getArchiveGroupList(
        gameBuild: string | number,
        archiveIdentifier: string | number
    ): Promise<Js5IndexEntity[]> {
        const fileStore = await this.getFileStore(gameBuild);
        const archive = await fileStore.getArchive(archiveIdentifier);

        await archive.loadGroupIndexes();

        const groups = Array.from(archive.groups.values());
        const results: Js5IndexEntity[] = new Array(groups.length);

        for (let i = 0; i < groups.length; i++) {
            results[i] = { ...groups[i].index };
            delete results[i].data;
            delete results[i].compressedData;
        }

        return results;
    }

    async getArchiveData(
        gameBuild: string | number,
        archiveIdentifier: string | number
    ): Promise<Buffer> {
        const fileStore = await this.getFileStore(gameBuild);
        const archive = await fileStore.getArchive(archiveIdentifier);
        return archive.index.compressedData;
    }

    async getArchive(
        gameBuild: string | number,
        archiveIdentifier: string | number
    ): Promise<Js5IndexEntity> {
        const fileStore = await this.getFileStore(gameBuild);
        const archive = await fileStore.getArchive(archiveIdentifier);

        const index = { ...archive.index };
        delete index.data;
        delete index.compressedData;

        return index;
    }

    async getArchiveList(gameBuild: string | number): Promise<Js5IndexEntity[]> {
        const fileStore = await this.getFileStore(gameBuild);

        const archives = Array.from(fileStore.archives.values());
        const results: Js5IndexEntity[] = new Array(archives.length);

        for (let i = 0; i < archives.length; i++) {
            results[i] = { ...archives[i].index };
            delete results[i].data;
            delete results[i].compressedData;
        }

        return results;
    }

    async getFileStore(gameBuild: string | number): Promise<Js5FileStore> {
        if (this.stores.has(gameBuild)) {
            return this.stores.get(gameBuild);
        }

        const fileStore = new Js5FileStore(gameBuild, this.fileStoreDir);
        await fileStore.load(true);

        this.stores.set(gameBuild, fileStore);

        return fileStore;
    }

}
