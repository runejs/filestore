import { FileStore } from '../file-store';
import { readFileSync } from 'fs';
import { join } from 'path';
import JSZip, { JSZipObject } from 'jszip';
import { logger } from '@runejs/core';
import { IndexManifest, IndexName } from '../index-manifest';
import { IndexedFile } from './indexed-file';
import { FileGroup } from './file-group';
import { ByteBuffer } from '@runejs/core/buffer';


export class IndexedArchive {

    private readonly fileStore: FileStore;
    private indexId: number;
    private indexName: IndexName;
    private manifest: IndexManifest;
    private loaded: boolean = false;

    public constructor(fileStore: FileStore, indexId: number, indexName?: string) {
        this.fileStore = fileStore;
        this.indexId = indexId;
        if(indexName) {
            this.indexName = indexName as IndexName;
        }
    }

    public async getFile(fileId: number): Promise<IndexedFile | FileGroup | null> {
        if(!this.manifest) {
            logger.error(`Index manifest not found - archive not yet loaded. ` +
                `Please use loadArchive() before attempting to access files.`);
            return null;
        }

        const zipArchive = await this.loadZip();

        if(!zipArchive) {
            return null;
        }

        const fileEntry = this.manifest.files[`${fileId}`];
        if(!fileEntry) {
            logger.error(`File not found ${fileId}`);
            return null;
        }

        const file = zipArchive.files[`${fileId}`] || zipArchive.files[`${fileId}/`];

        if(!file) {
            throw new Error(`File not found: ${fileEntry.file}`);
        }

        if(file.dir) {
            const folder = zipArchive.folder(fileEntry.file);
            const folderFileNames = Object.keys(folder.files) ?? [];
            const folderFiles: { [key: string]: JSZipObject } = {};
            folderFileNames.filter(fileName => fileName?.startsWith(`${fileId}/`))
                .forEach(fileName => folderFiles[fileName] = folder.files[fileName]);
            return new FileGroup(this.manifest, fileId, folderFiles);
        } else {
            const fileData = await file.async('nodebuffer');
            return new IndexedFile(this.manifest, fileId, new ByteBuffer(fileData));
        }
    }

    public async loadArchive(): Promise<void> {
        const zipArchive = await this.loadZip();

        if(!zipArchive) {
            return;
        }

        const noFilesError = `No files found within indexed archive ${this.indexId} ${this.indexName}`;
        if(!zipArchive.files) {
            logger.error(noFilesError);
            return;
        }

        const fileNames = Object.keys(zipArchive.files);

        if(!fileNames?.length) {
            logger.error(noFilesError);
            return;
        }

        const manifestFile = zipArchive.files['.manifest.json'];
        if(!manifestFile) {
            logger.error(`Missing manifest file for indexed archive ${this.indexId} ${this.indexName}`);
            return;
        }

        this.manifest = JSON.parse(await manifestFile.async('string')) as IndexManifest;

        /*const indexes = Object.keys(this.manifest.files);

        for(const fileIndex of indexes) {
            const fileEntry = this.manifest.files[fileIndex];

            if(!fileEntry?.file) {
                continue;
            }

            const fileName = fileEntry.file;

            if(fileName.startsWith('.')) {
                continue;
            }

            const archivedFile = zipArchive.files[fileName];
            if(archivedFile.dir) {
                const folder = zipArchive.folder(fileName);
                const folderFiles = folder.files;
                const folderFileNames = Object.keys(folderFiles);

                for(let subFileId = 0; subFileId < folderFileNames.length; subFileId++) {
                    const subFileName = folderFileNames[subFileId];
                    const subFileData = await folderFiles[subFileName].async('nodebuffer');
                }
            } else {
                const fileData = await archivedFile.async('nodebuffer');
            }
        }*/

        this.loaded = true;
    }

    public async loadZip(): Promise<JSZip> {
        try {
            const archive = await JSZip.loadAsync(readFileSync(this.filePath));

            if(!archive) {
                logger.error(`Error loading indexed archive ${this.indexId} ${this.indexName}`);
                return null;
            }

            return archive;
        } catch(error) {
            logger.error(`Error loading indexed archive ${this.indexId} ${this.indexName}`);
            logger.error(error);
            return null;
        }
    }

    public get filePath(): string {
        return join(this.fileStore.fileStorePath, `${this.indexId}_${this.indexName}.zip`);
    }

}
