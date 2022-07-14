import { IndexEntity } from '../db/index-entity';
import { FileStore } from './file-store';
import { FileType } from '../config/file-type';


export class FileBase {

    readonly fileStore: FileStore;

    index: IndexEntity;

    constructor(
        fileStore: FileStore,
        key: number,
        parentKey: number,
        fileType: FileType,
    ) {
        this.fileStore = fileStore;
        this.index = new IndexEntity();
        this.index.gameBuild = fileStore.gameBuild;
        this.index.fileType = fileType;
        this.index.key = key;
        this.index.parentKey = parentKey;
    }

    async saveIndex(): Promise<IndexEntity> {
        this.index = await this.fileStore.database.saveIndex(this.index);
        return this.index;
    }

    async loadIndex(): Promise<IndexEntity> {
        const indexEntity = await this.fileStore.database.getIndex(
            this.index.fileType, this.index.key, this.index.parentKey
        );

        if (indexEntity) {
            this.index = indexEntity;
        }

        return this.index;
    }

    get stripes(): number[] {
        if (!this.index?.stripes) {
            return [];
        }

        return this.index.stripes.split(',').map(n => Number(n));
    }

}
