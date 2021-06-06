import { FileStore } from '../file-store';
import { readFileSync } from 'fs';
import path, { join } from 'path';
import JSZip, { JSZipObject } from 'jszip';
import { logger } from '@runejs/core';
import { fileExtensions, getIndexId, FileMetadata, IndexManifest, IndexName } from '../index-manifest';
import { IndexedFile } from './indexed-file';
import { IndexedFileGroup } from './indexed-file-group';
import { ByteBuffer } from '@runejs/core/buffer';
import { Archive, getFileName, hash } from '../../client-store';
import * as CRC32 from 'crc-32';
import fs from 'fs';


export class IndexedArchive {

    public files: { [key: number]: IndexedFile } = {};
    public archiveData: ByteBuffer | null = null;

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

    public newFileIndex(): number {
        const currentIndexes: number[] = Object.keys(this.files).map(indexStr => parseInt(indexStr, 10));
        return Math.max(...currentIndexes) + 1;
    }

    public async indexArchiveFiles(): Promise<void> {
        const storeZip = await this.loadZip();

        if(!storeZip) {
            return;
        }

        logger.info(`Indexing ${this.filePath}...`);

        const newManifest: IndexManifest = {
            indexId: this.indexId,
            name: this.indexName,
            fileCompression: this.manifest.fileCompression,
            fileExtension: this.manifest.fileExtension,
            format: this.manifest.format ?? undefined,
            version: this.manifest.version ?? undefined,
            settings: this.manifest.settings ?? undefined,
            files: {}
        };

        const oldFiles = this.files;

        const originalFile = (fileName: string): FileMetadata | null => oldFiles[fileName] ?? null;

        const originalFileIndex = (fileName: string): number => {
            const fileIndexes: string[] = Object.keys(this.files);
            for(const fileIndex of fileIndexes) {
                if(this.files[fileIndex]?.file === fileName) {
                    return parseInt(fileIndex, 10);
                }
            }
            return -1;
        };

        const extension = this.manifest.fileExtension;
        const fileNames = Object.keys(storeZip.files).filter(fileName => {
            if(!fileName) {
                return false;
            }

            // Include file groups
            if(fileName.endsWith('/')) {
                return true;
            }

            // Exclude grouped files (for now)
            if(fileName.indexOf('/') !== -1) {
                return false;
            }

            return fileName.endsWith(extension);
        });

        logger.info(`Found ${fileNames.length} files or file groups.`);

        for(const fileName of fileNames) {
            const noFileExtension = fileName.replace(this.manifest.fileExtension, '');
            const zippedFile = storeZip.files[fileName];
            const oldFile: FileMetadata | null = originalFile(fileName);
            const oldFileIndex: number = originalFileIndex(fileName);
            const fileIndex = oldFileIndex !== -1 ? oldFileIndex : this.newFileIndex();
            newManifest.files[fileIndex] = oldFile ? oldFile : {
                file: fileName
            };

            if(zippedFile.dir) {
                const folder = storeZip.folder(fileName);
                const folderFileNames = Object.keys(folder.files) ?? [];
                const folderFiles: { [key: string]: JSZipObject } = {};
                folderFileNames
                    .filter(groupedFileName => groupedFileName?.startsWith(fileName) &&
                        groupedFileName?.endsWith(this.manifest.fileExtension))
                    .forEach(groupedFileName => folderFiles[groupedFileName] = folder.files[groupedFileName]);

                newManifest.files[fileIndex].children = new Array(folderFileNames.length);
            } else {
                const fileData = await zippedFile.async('nodebuffer');
                const indexedFile = new IndexedFile(this.manifest, fileIndex, new ByteBuffer(fileData));
                if(indexedFile.fileData) {
                    newManifest.files[fileIndex].crc = CRC32.buf(indexedFile.fileData);
                    newManifest.files[fileIndex].sha256 = ''; // @TODO left off here
                }
            }
        }

        /*const fileCount = this.files.size;
        const fileExt = fileExtensions[this.archiveName];

        logger.info(`${fileCount} files found within this archive.`);

        const fileIndex: { [key: number]: IndexedFileEntry } = {};
        const errors: { [key: number]: string[] } = {};

        const pushError = (fileId: number, error) => {
            logger.error(error);

            if(errors[fileId]) {
                errors[fileId].push(error);
            } else {
                errors[fileId] = [ error ];
            }
        }

        for(let fileId = 0; fileId < fileCount; fileId++) {
            const file = this.files.get(fileId);

            if(!file) {
                pushError(fileId, `File not found`);
                continue;
            }

            const fileName = file.nameHash ? getFileName(file.nameHash) : fileId;

            if(file instanceof Archive) {
                // Write sub-archive/folder

                fileIndex[fileId] = {
                    file: `${fileName}`,
                    version: file.version || -1
                };

                const archive = file as Archive;
                const folder = storeZip.folder(`${fileName}`);
                archive.decodeArchiveFiles();
                const archiveFileCount = archive.files.size;

                for(let archiveFileId = 0; archiveFileId < archiveFileCount; archiveFileId++) {
                    const archiveFile = archive.getFile(archiveFileId);
                    const archiveFileName = archiveFileId + (archiveFile.nameHash ? '_' +
                        getFileName(archiveFile.nameHash) : '');

                    if(!archiveFile?.content) {
                        pushError(fileId, `Sub-archive file ${fileId} not found`);
                        continue;
                    }

                    folder.file(archiveFileName + fileExt, Buffer.from(archiveFile.content));
                }
            } else {
                // Write single file

                fileIndex[fileId] = {
                    file: fileName + fileExt,
                    version: file.version || -1
                };

                let decompressedFile: ByteBuffer;

                try {
                    decompressedFile = file.decompress();
                } catch(error) {
                    if(error?.message === 'MISSING_ENCRYPTION_KEYS') {
                        pushError(fileId, `Missing encryption keys for file ${fileId}`);
                    }
                }

                if(!(decompressedFile ?? file.content)) {
                    pushError(fileId, `File not found`);
                    continue;
                }

                storeZip.file(fileName + fileExt, Buffer.from(decompressedFile ?? file.content));
            }
        }

        const manifest: IndexManifest = {
            indexId: this.indexId,
            name: this.archiveName as IndexName,
            fileCompression: !this.compression ? 'uncompressed' : (this.compression === 1 ? 'bzip' : 'gzip'),
            fileExtension: fileExt,
            format: this.format,
            version: this.version,
            settings: this.settings,
            files: fileIndex
        };

        storeZip.file(`.manifest.json`, JSON.stringify(manifest, null, 4));

        if(Object.keys(errors).length) {
            storeZip.file(`.error-log.json`, JSON.stringify(errors, null, 4));
        }

        await new Promise<void>(resolve => {
            storeZip.generateNodeStream({ type: 'nodebuffer', streamFiles: true })
                .pipe(fs.createWriteStream(this.storePath))
                .on('finish', () => {
                    logger.info(`${this.storePath} written.`);
                    resolve();
                });
        });*/
    }

    public async unpack(): Promise<void> {
        const fileIndexes = Object.keys(this.manifest.files)
            .map(indexStr => parseInt(indexStr, 10));
        const fileCount = fileIndexes.length;

        let promiseList: Promise<void>[] = new Array(fileCount);
        for(let i = 0; i < fileCount; i++) {
            promiseList[i] = this.getFile(fileIndexes[i]).then(async file => {
                if(!!file?.fileId) {
                    this.files[file.fileId] = file;

                    if(file instanceof IndexedFileGroup) {
                        file.fileData = await file.pack();
                    }
                }
            });
        }

        await Promise.all(promiseList);

        this.loaded = true;
    }

    public async compress(): Promise<ByteBuffer> {
        const fileIndexes = Object.keys(this.manifest.files)
            .map(indexStr => parseInt(indexStr, 10));
        const fileCount = fileIndexes.length;

        // Fetch indexed files
        let files: IndexedFile[] = new Array(fileCount);
        for(let i = 0; i < fileCount; i++) {
            files[i] = await this.getFile(fileIndexes[i]);
        }

        files = files.filter(file => !!file);

        const buffer = new ByteBuffer(250000);
        let writtenFileIndex = 0;

        // Write index file header
        buffer.put(this.manifest.format ?? 5);
        buffer.put(this.manifest.settings ?? 0);
        buffer.put(fileCount, 'short');

        // Write file indexes
        for(const file of files) {
            buffer.put(file.fileId - writtenFileIndex, 'short');
            writtenFileIndex = file.fileId;
        }

        // Write name hashes (if applicable)
        if(this.fileNames) {
            for(const file of files) {
                const fileName = file.fileName;
                let nameHash: number;
                if(/^[a-zA-Z ]+$/i) {
                    // Actual name
                    nameHash = hash(fileName);
                } else {
                    // Unknown name (hashed still)
                    nameHash = parseInt(fileName, 10);
                }

                buffer.put(nameHash, 'int');
            }
        }

        // Write file crc values
        for(const file of files) {
            const packedFile = await file.pack();
            const crc = CRC32.buf(packedFile);
            buffer.put(crc, 'int');
        }

        // Write file version numbers
        for(const file of files) {
            buffer.put(file.fileVersion, 'int');
        }

        // Write file group child counts
        for(const file of files) {
            if(file instanceof IndexedFileGroup) {
                buffer.put(file.fileCount, 'short');
            } else {
                buffer.put(0, 'short');
            }
        }

        // Write file group children
        for(const file of files) {
            if(!(file instanceof IndexedFileGroup)) {
                continue;
            }

            const group = file as IndexedFileGroup;
            const childKeys = Object.keys(group.files);
            writtenFileIndex = 0;

            // Write child indexes
            for(const childKey of childKeys) {
                const childFile = await group.getFile(childKey, false);
                if(!childFile) {
                    continue;
                }

                buffer.put(childFile.fileId - writtenFileIndex, 'short');
                writtenFileIndex = childFile.fileId;
            }

            // Write child name hashes (if applicable)
            if(this.fileNames) {
                for(const childKey of childKeys) {
                    const childFile = await group.getFile(childKey, false);
                    if(!childFile) {
                        continue;
                    }

                    const fileName = childFile.fileName;
                    let nameHash: number;
                    if(/^[a-zA-Z ]+$/i) {
                        // Actual name
                        nameHash = hash(fileName);
                    } else {
                        // Unknown name (hashed still)
                        nameHash = parseInt(fileName, 10);
                    }

                    buffer.put(nameHash, 'int');
                }
            }
        }

        this.archiveData = buffer.flipWriter();
        return this.archiveData;
    }

    public async getFile(fileId: number): Promise<IndexedFile | null> {
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
            logger.error(`File not found ${fileId}`);
            return null;
        }

        if(file.dir) {
            const folder = zipArchive.folder(fileEntry.file);
            const folderFileNames = Object.keys(folder.files) ?? [];
            const folderFiles: { [key: string]: JSZipObject } = {};
            folderFileNames
                .filter(fileName => fileName?.startsWith(`${fileId}/`) && fileName?.endsWith(this.manifest.fileExtension))
                .forEach(fileName => folderFiles[fileName] = folder.files[fileName]);
            return new IndexedFileGroup(this.manifest, fileId, folderFiles);
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

    public get archiveName(): string {
        return getIndexId(this.indexId) as string;
    }

    public get fileNames(): boolean {
        return (this.manifest.settings & 0x01) !== 0
    }

    public get filePath(): string {
        return join(this.storeOutputDir, `${this.indexId}_${this.indexName}.zip`);
    }

    public get storeOutputDir(): string {
        return path.join(this.outputDir, 'stores');
    }

    public get outputDir(): string {
        return path.join('.', 'output');
    }

}
