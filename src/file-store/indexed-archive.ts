import { FileStore } from './file-store';
import { readFileSync } from 'fs';
import { join } from 'path';
import JSZip from 'jszip';
import { logger } from '@runejs/core';
import { IndexManifest, IndexName } from './index-manifest';


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



    public async loadArchive(): Promise<void> {
        const zipArchive = await JSZip.loadAsync(readFileSync(this.filePath));

        if(!zipArchive) {
            logger.error(`Error loading indexed archive ${this.indexId} ${this.indexName}`);
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

    public get filePath(): string {
        return join(this.fileStore.fileStorePath, `${this.indexId}_${this.indexName}.zip`);
    }

}
