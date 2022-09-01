import { Inject, Injectable } from '@decorators/di';
import { FILESTORE_DIR } from '../config';
import { Js5FileStore } from '../../file-system';
import { Js5IndexEntity } from '../../db/js5';
import { logger } from '@runejs/common';
import { Buffer } from 'buffer';
import { Js5ArchiveConfig } from '../../config';


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
    ): Promise<Buffer | null> {
        const fileStore = await this.getFileStore(gameBuild);
        const archive = await fileStore.getArchive(archiveIdentifier);
        const group = await archive.getGroup(groupIdentifier);
        const file = await group.getFile(fileIdentifier);
        return file.getCompressedData();
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
        return file.index;
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

        return Array.from(group.files.values()).map(file => file.index);
    }

    async getArchiveGroupData(
        gameBuild: string | number,
        archiveIdentifier: string | number,
        groupIdentifier: string | number
    ): Promise<Buffer | null> {
        const fileStore = await this.getFileStore(gameBuild);
        const archive = await fileStore.getArchive(archiveIdentifier);
        const group = await archive.getGroup(groupIdentifier);
        return group.getCompressedData();
    }

    async getArchiveGroup(
        gameBuild: string | number,
        archiveIdentifier: string | number,
        groupIdentifier: string | number
    ): Promise<Js5IndexEntity> {
        const fileStore = await this.getFileStore(gameBuild);
        const archive = await fileStore.getArchive(archiveIdentifier);
        const group = await archive.getGroup(groupIdentifier);
        return group.index;
    }

    async getArchiveGroupList(
        gameBuild: string | number,
        archiveIdentifier: string | number
    ): Promise<Js5IndexEntity[]> {
        const fileStore = await this.getFileStore(gameBuild);
        const archive = await fileStore.getArchive(archiveIdentifier);

        await archive.loadGroupIndexes();

        return Array.from(archive.groups.values()).map(group => group.index);
    }

    async getArchiveData(
        gameBuild: string | number,
        archiveIdentifier: string | number
    ): Promise<Buffer | null> {
        const fileStore = await this.getFileStore(gameBuild);
        const archive = await fileStore.getArchive(archiveIdentifier);
        return archive.getCompressedData();
    }

    async getArchive(
        gameBuild: string | number,
        archiveIdentifier: string | number
    ): Promise<Js5IndexEntity> {
        const fileStore = await this.getFileStore(gameBuild);
        const archive = await fileStore.getArchive(archiveIdentifier);
        return archive.index;
    }

    async getArchiveList(gameBuild: string | number): Promise<Js5IndexEntity[]> {
        const fileStore = await this.getFileStore(gameBuild);
        return Array.from(fileStore.archives.values()).map(archive => archive.index);
    }

    async getArchiveConfig(gameBuild): Promise<{ [key: string]: Js5ArchiveConfig }> {
        const fileStore = await this.getFileStore(gameBuild);
        return fileStore.archiveConfig;
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
