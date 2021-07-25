import { FileStore } from '../file-store';
import fs from 'fs';
import path, { join } from 'path';
import JSZip from 'jszip';
import { logger } from '@runejs/core';
import { FileMetadata, IndexManifest} from '../index-manifest';
import { ByteBuffer } from '@runejs/core/buffer';
import { hashFileName } from '../../client-store';
import { compressFile } from '../../compression';
import { IndexedFile, FlatFile, FileGroup } from '../file';
import { compressionKey, IndexName } from './config';


export class IndexedArchive {

    public files: { [key: number]: IndexedFile } = {};

    private readonly fileStore: FileStore;
    private indexId: number;
    private indexName: IndexName;
    private loaded: boolean = false;
    private _manifest: IndexManifest;
    private _fileErrors: { [key: string]: string[] };

    public constructor(fileStore: FileStore, indexId: number, indexName?: string) {
        this.fileStore = fileStore;
        this.indexId = indexId;
        if(indexName) {
            this.indexName = indexName as IndexName;
        }
    }

    /**
     * Re-indexes the entire archive, evaluating each file and file group for changes to append to the manifest file.
     */
    public async indexArchiveFiles(): Promise<void> {
        await this.unpack(false);

        /*const storeZip = await this.loadZip();

        if(!storeZip) {
            return;
        }*/

        logger.info(`Indexing ${this.filePath}...`);
        logger.info(`Original file count: ${Object.keys(this.files).length}`);

        const newManifest: IndexManifest = {
            indexId: this.indexId,
            name: this.indexName,
            fileCompression: this._manifest.fileCompression,
            fileExtension: this._manifest.fileExtension,
            format: this._manifest.format ?? undefined,
            version: this._manifest.version ?? undefined,
            settings: this._manifest.settings ?? undefined,
            crc: 0,
            sha256: '',
            files: {}
        };

        const originalFileIndex = (fileName: string, fileList: IndexedFile[]): number => {
            const folderCheck = fileName.replace('/', '');
            const originalFile = fileList.find(indexedFile =>
                indexedFile.fullFileName === fileName || indexedFile.fullFileName === folderCheck);
            return originalFile?.fileId ?? -1;
        };

        const extension = this._manifest.fileExtension;

        const storeDirectory = fs.readdirSync(this.filePath);

        const fileNames = storeDirectory.filter(fileName => {
            if(!fileName || fileName === '.manifest.json' || fileName === '.errors.json') {
                return false;
            }

            // Include file groups
            if(fileName.endsWith('/')) {
                return true;
            }

            // Exclude grouped file children (for now)
            if(fileName.indexOf('/') !== -1) {
                return false;
            }

            return fileName.endsWith(extension);
        });

        const existingFileList: IndexedFile[] = Object.values(this.files);

        logger.info(`Found ${fileNames.length} files or file groups.`);

        let newFileIndex = this.createNewFileIndex();

        for(let fileName of fileNames) {
            // const zippedFile = storeZip.files[fileName];
            const indexedFilePath = path.join(this.filePath, fileName);
            if(!fs.existsSync(indexedFilePath)) {
                logger.error(`File ${fileName} not found.`);
                continue;
            }

            const fileStats = fs.statSync(indexedFilePath);
            const oldFileIndex: number = originalFileIndex(fileName, existingFileList);
            const oldFile: FileMetadata | null = oldFileIndex !== -1 ? this._manifest.files[oldFileIndex] ?? null : null;
            const fileIndex = oldFileIndex !== -1 ? oldFileIndex : newFileIndex++;

            let nameHash: number | undefined;
            const actualFileName = fileName.replace(this.manifest.fileExtension, '')
                .replace('/', '');
            if(this.fileNames) {
                nameHash = /[a-z]/ig.test(actualFileName) ? hashFileName(actualFileName) : parseInt(actualFileName, 10);
            }

            const newFile: FileMetadata = newManifest.files[fileIndex] = {
                file: fileName,
                realName: actualFileName,
                nameHash: nameHash ?? undefined,
                version: oldFile?.version ?? 0
            };

            let indexedFile: IndexedFile;

            if(fileStats.isDirectory()) {
                // Read the child file names
                newFile.children = fs.readdirSync(indexedFilePath);
                indexedFile = new FileGroup(this, fileIndex, newFile);
                await (indexedFile as FileGroup).loadFiles();
            } else {
                indexedFile = new FlatFile(this, fileIndex, new ByteBuffer(fs.readFileSync(indexedFilePath)));
            }

            newFile.sha256 = await indexedFile.generateShaHash();
            newFile.crc = await indexedFile.generateCrc32();
            newFile.fileSize = await indexedFile.getCompressedFileLength();

            if(!oldFile?.sha256) {
                // Use CRC32 if SHA256 is not available for this file
                if(oldFile?.crc !== newFile.crc) {
                    newFile.version++;
                }
            } else if(oldFile.sha256 !== newFile.sha256) {
                // Use the more modern SHA256 for comparison instead of CRC32
                // Update the file's version number if it already existed and has changed
                // newFile.version++;
                // logger.info(`File ${fileIndex} version increased from ${newFile.version - 1} to ${newFile.version}`);
            }

            // Save space and don't include a version number for first-version files
            if(newFile.version <= 0) {
                delete newFile.version;
            }
        }

        this._manifest = newManifest;

        const indexData = await this.generateIndexFile();
        this._manifest.crc = await IndexedFile.generateCrc32(indexData);
        this._manifest.sha256 = await IndexedFile.generateShaHash(indexData);

        if(fs.existsSync(this.outputFilePath)) {
            fs.rmSync(this.outputFilePath, { recursive: true });
        }

        fs.mkdirSync(this.outputFilePath);

        fs.writeFileSync(path.join(this.outputFilePath, '.manifest.json'), JSON.stringify(this._manifest, null, 4));
    }

    /**
     * Unpacks the archive, it's manifest, and it's files.
     * @param loadFileData Whether or not to load file contents into memory. Defaults to true.
     * @param compressFileData Compress the file data if loaded. Defaults to true.
     * @param forceAsync Forces the files to be loaded in async fashion without using the recorded
     * fileSize in the manifest. Defaults to false.
     */
    public async unpack(loadFileData: boolean = true,
                        compressFileData: boolean = true,
                        forceAsync: boolean = false): Promise<void> {
        const fileIndexes = Object.keys(this._manifest.files).map(indexStr => parseInt(indexStr, 10));

        for(const index of fileIndexes) {
            const indexedFile = await this.loadFile(index, loadFileData);

            if(loadFileData && compressFileData) {
                await indexedFile.compress();
            }

            this.files[index] = indexedFile;
        }

        this.loaded = true;
    }

    /**
     * Compresses the archive's index data into a flat file for update server and client usage.
     */
    public async generateIndexFile(): Promise<ByteBuffer> {
        await this.loadManifestFile();

        const files = this._fileErrors ? { ...this._fileErrors, ...this._manifest.files } : this._manifest.files;
        const fileIndexes = Object.keys(files).map(indexStr => parseInt(indexStr, 10))
            .sort((a, b) => a - b);
        const fileCount = fileIndexes.length;

        const buffer = new ByteBuffer(1000 * 1000);
        let writtenFileIndex = 0;

        // Write index file header
        buffer.put(this.manifest.format ?? 5);
        buffer.put(this.manifest.settings ?? 0);
        buffer.put(fileCount, 'short');

        // Write file indexes
        for(const fileIndex of fileIndexes) {
            buffer.put(fileIndex - writtenFileIndex, 'short');
            writtenFileIndex = fileIndex;
        }

        // Write name hashes (if applicable)
        if(this.fileNames) {
            logger.info(`Writing file names for archive ${this.indexId}.`);

            for(const fileIndex of fileIndexes) {
                const file = files[fileIndex];
                if(!file?.file) {
                    buffer.put(0, 'int');
                } else {
                    buffer.put(file.nameHash ?? 0, 'int');
                }
            }
        }

        // Write file crc values
        for(const fileIndex of fileIndexes) {
            const file = files[fileIndex];
            buffer.put(file?.crc ?? 0, 'int');
        }

        // Write file version numbers
        for(const fileIndex of fileIndexes) {
            const file = files[fileIndex];
            buffer.put(file?.version ?? 0, 'int');
        }

        // Write file group child counts
        for(const fileIndex of fileIndexes) {
            const file = files[fileIndex];
            buffer.put(file?.children?.length || 1, 'short');
        }

        // Write file group children
        for(const fileIndex of fileIndexes) {
            const file = files[fileIndex];
            const childCount = file?.children?.length || 1;

            writtenFileIndex = 0;

            // Write child indexes
            for(let i = 0; i < childCount; i++) {
                if(file?.children) {
                    const child = file.children[i];
                    const idxStr = child.substr(0, child.indexOf('.'));
                    const index = parseInt(idxStr, 10);

                    buffer.put(index - writtenFileIndex, 'short');
                    writtenFileIndex = index;
                } else {
                    buffer.put(i - writtenFileIndex, 'short');
                    writtenFileIndex = i;
                }
            }
        }

        // Write child name hashes (if applicable)
        // @TODO Single child files need a name of blank string?
        if(this.fileNames) {
            for(const fileIndex of fileIndexes) {
                const file = files[fileIndex];
                if(file?.children) {
                    for(let i = 0; i < file.children.length; i++) {
                        const childFile = file.children[i];
                        if(!childFile) {
                            buffer.put(0, 'int');
                        } else {
                            const fileName = this.manifest.fileExtension ?
                                childFile.replace(this.manifest.fileExtension, '') : childFile;
                            const nameHash: number = /[a-z]/ig.test(fileName) ?
                                hashFileName(fileName) : parseInt(fileName, 10);
                            buffer.put(nameHash, 'int');
                        }
                    }
                } else {
                    buffer.put(0, 'int');
                }
            }
        }

        const archiveData = buffer.flipWriter();

        const compression = compressionKey[this.manifest.fileCompression];

        return compressFile({
            buffer: archiveData,
            compression
        });
    }

    /**
     * Loads the specified file from the zip archive on disc.
     * @param fileIndex The index of the file to load.
     * @param loadFileData Whether or not to load the file's data into memory automatically. Defaults to true.
     * @param zipArchive [optional] An active instance of the zip archive object from JSZip may be passed in to
     * avoid the zip file being repeatedly loaded and unloaded for multi-file loading.
     */
    public async loadFile(fileIndex: number, loadFileData: boolean = true,
                          zipArchive?: JSZip): Promise<FlatFile | FileGroup | null> {
        if(!this._manifest) {
            logger.error(`Index manifest not found - archive not yet loaded. ` +
                `Please use loadArchive() before attempting to access files.`);
            return null;
        }

        if(!zipArchive) {
            // zipArchive = await this.loadZip();
        }

        const fileEntry: FileMetadata = this._manifest.files[`${fileIndex}`];
        if(!fileEntry) {
            logger.error(`File ${fileIndex} was not found within the archive manifest.`);
            return null;
        }

        const filePath = path.join(this.filePath, fileEntry.file);

        if(!fs.existsSync(filePath)) {
            logger.error(`File ${fileIndex} was not found.`);
            return null;
        }

        const fileStats = fs.statSync(filePath);

        /*const file = zipArchive.files[fileEntry.file] ?? zipArchive.files[fileEntry.file + '/'];

        if(!file) {
            logger.error(`File ${fileEntry.file} was not found.`);
            return null;
        }*/

        if(fileStats.isDirectory()) {
            // const folder = zipArchive.folder(fileEntry.file);
            const fileGroup = new FileGroup(this, fileIndex, fileEntry);
            if(loadFileData) {
                await fileGroup.loadFiles();
            }
            return fileGroup;
        } else {
            const fileData = loadFileData && fileStats ? new ByteBuffer(fs.readFileSync(filePath)) : null;
            return new FlatFile(this, fileIndex, fileData);
        }
    }

    /**
     * Loads the archive's manifest and error log files from the zip archive on disc.
     * @param force Force re-load the manifest if it is already loaded. Defaults to false.
     */
    public loadManifestFile(force: boolean = false): IndexManifest | null {
        if(this.loaded && !force) {
            return this._manifest ?? null;
        }

        if(!fs.existsSync(this.filePath)) {
            throw new Error(`${this.filePath} does not exist!`);
        }

        const manifestFilePath = path.join(this.filePath, '.manifest.json');

        if(!fs.existsSync(manifestFilePath)) {
            throw new Error(`No manifest file found for index ${this.indexName}!`);
        }

        const manifestFileContent = fs.readFileSync(manifestFilePath, 'utf-8');

        if(manifestFileContent) {
            this._manifest = JSON.parse(manifestFileContent);
        }

        const errorFilePath = path.join(this.filePath, '.errors.json');

        if(fs.existsSync(errorFilePath)) {
            const errorFileContent = fs.readFileSync(errorFilePath, 'utf-8');
            if(errorFileContent) {
                this._fileErrors = JSON.parse(errorFileContent);
            }
        }

        if(!this._manifest) {
            throw new Error(`Error loading manifest for index ${this.indexName}.`);
        }

        /*const zipArchive = await this.loadZip();

        if(!zipArchive) {
            logger.error(`Store zip not found.`);
            return this._manifest ?? null;
        }

        const noFilesError = `No files found within indexed archive ${this.indexId} ${this.indexName}`;
        if(!zipArchive.files) {
            logger.error(noFilesError);
            return this._manifest ?? null;
        }

        const fileNames = Object.keys(zipArchive.files);
        if(!fileNames?.length) {
            logger.error(noFilesError);
            return this._manifest ?? null;
        }

        const manifestFile = zipArchive.files['.manifest.json'];
        if(!manifestFile) {
            logger.error(`Missing manifest file for indexed archive ${this.indexId} ${this.indexName}`);
            return this._manifest ?? null;
        }

        const errorLogFile = zipArchive.files['.errors.json' ];
        if(errorLogFile) {
            logger.info(`Error log found for index ${this.indexId}.`);
            const errorLogContent = await errorLogFile.async('string');
            this._fileErrors = JSON.parse(errorLogContent) as { [key: string]: string[] };
        }

        this._manifest = JSON.parse(await manifestFile.async('string')) as IndexManifest;*/
        this.loaded = true;

        return this._manifest;
    }

    /**
     * Loads the zip archive on disc as a JSZip object and returns it.
     */
    public async loadZip(): Promise<JSZip> {
        try {
            return await new JSZip.external.Promise((resolve, reject) => {
                fs.readFile(this.filePath, (err, data) => {
                    if(err) {
                        reject(err);
                    } else {
                        resolve(data);
                    }
                });
            }).then((data: any) => JSZip.loadAsync(data));
        } catch(error) {
            logger.error(`Error loading indexed archive ${this.indexId} ${this.indexName}`);
            logger.error(error);
            return null;
        }
    }

    /**
     * Creates a brand new file index for this archive based off of the last file entry's index.
     */
    public createNewFileIndex(): number {
        const currentIndexes: number[] = Object.keys(this.files).map(indexStr => parseInt(indexStr, 10));
        return Math.max(...currentIndexes) + 1;
    }

    public get manifest(): IndexManifest {
        return this._manifest;
    }

    public get fileErrors(): { [p: string]: string[] } {
        return this._fileErrors;
    }

    public get archiveName(): string {
        return this._manifest?.name;
    }

    public get fileNames(): boolean {
        return (this._manifest.settings & 0x01) !== 0
    }

    public get filePath(): string {
        return join(this.fileStore.fileStorePath, `${this.indexName}`);
    }

    public get outputFilePath(): string {
        return join(this.storeOutputDir, `${this.indexName}`);
    }

    public get storeOutputDir(): string {
        return path.join(this.outputDir, 'stores');
    }

    public get outputDir(): string {
        return path.join('.', 'output');
    }

}
