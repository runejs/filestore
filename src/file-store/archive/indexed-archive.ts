import { FileStore } from '../file-store';
import fs from 'fs';
import path from 'path';
import { logger } from '@runejs/core';
import { FileGroupMetadata, ArchiveIndex, readIndexFile, writeIndexFile } from '../archive-index';
import { ByteBuffer } from '@runejs/core/buffer';
import { compressFile } from '../../compression';
import { IndexedFile, FlatFile, FileGroup } from '../file';
import { ArchiveConfig, ArchiveContentType, compressionKey, getArchiveConfig, IndexName } from './config';
import { hashFileName } from '../../util';


export class IndexedArchive {

    public readonly fileStore: FileStore;
    public readonly config: ArchiveConfig;
    public readonly archiveIndex: number;
    public readonly indexName: IndexName;

    public groups: Map<string, IndexedFile> = new Map<string, IndexedFile>();

    private loaded: boolean = false;
    private _manifest: ArchiveIndex;

    public constructor(fileStore: FileStore, indexId: number, indexName?: string) {
        this.fileStore = fileStore;
        this.archiveIndex = indexId;
        if(indexName) {
            this.indexName = indexName as IndexName;
        }
        this.config = getArchiveConfig(this.archiveIndex);
    }

    public getExistingFileIndex(fileName: string): number {
        for(const [ groupIndex, group ] of this._manifest.groups) {
            if(group?.name === fileName) {
                return Number(groupIndex);
            }
        }
        return -1;
    }

    /**
     * Creates a brand new file index for this archive based off of the last file entry's index.
     */
    public getLastFileIndex(): number {
        const fileIndices = Array.from(this.groups.keys()).map(n => Number(n));
        if(!fileIndices?.length) {
            return 0;
        }

        let min = fileIndices[0] ?? 0;
        for(const [ index, ] of this._manifest.groups) {
            const n = Number(index);
            if(n < min) {
                min = n;
            }
        }

        return min;
    }

    /**
     * Re-indexes the entire archive, evaluating each file and file group for changes to append to the manifest file.
     */
    public async indexArchiveFiles(): Promise<void> {
        logger.info(`Loading files for ${this.filePath}...`);

        await this.unpack(false);

        logger.info(`Original file count: ${this.groups.size}`);

        const newManifest: ArchiveIndex = {
            index: this.archiveIndex,
            crc: 0,
            sha256: '',
            version: this._manifest.version ?? undefined,
            groups: new Map<string, FileGroupMetadata>()
        };

        const extension = this.config.content?.fileExtension;
        const storeDirectory = fs.readdirSync(this.filePath);

        const currentFileNames = storeDirectory.filter(fileName => {
            if(!fileName || fileName === '.index') {
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

            return fileName.endsWith(extension) || (fileName.indexOf('/') === -1);
        }).map(fileName => {
            const extensionIndex = fileName?.lastIndexOf('.') ?? -1;
            if(extensionIndex !== -1) {
                return fileName.substring(0, extensionIndex);
            } else {
                return fileName;
            }
        });

        logger.info(`Found ${currentFileNames.length} files or file groups.`);

        for(const [ groupIndex, groupMetadata ] of this._manifest.groups) {
            const fileName = groupMetadata.name;

            const existingIndex = currentFileNames.indexOf(fileName);

            if(existingIndex === -1) {
                // file no longer exists - perhaps deleted
                continue;
            }

            // previously existing file that was re-discovered by the indexer

            currentFileNames.splice(existingIndex, 1);

            let indexedFilePath;
            if(extension && this.contentType === 'files') {
                // Only add extensions for flat files
                indexedFilePath = path.join(this.filePath, fileName + extension);
            } else {
                indexedFilePath = path.join(this.filePath, fileName);
            }

            const fileStats = fs.statSync(indexedFilePath);

            let nameHash: number | undefined;
            const actualFileName = fileName.replace(extension, '').replace('/', '');
            if(this.config.content?.saveFileNames) {
                nameHash = /[a-z]/ig.test(actualFileName) ? hashFileName(actualFileName) : Number(actualFileName);
            }

            const newFile: FileGroupMetadata = {
                name: fileName,
                nameHash: nameHash ?? undefined,
                version: groupMetadata?.version ?? 0
            };

            newManifest.groups.set(groupIndex, newFile);

            let indexedFile: IndexedFile;
            const numericIndex = Number(groupIndex);

            if(fileStats.isDirectory()) {
                // Read the child file names
                newFile.fileNames = fs.readdirSync(indexedFilePath);
                indexedFile = new FileGroup(this, numericIndex, newFile);
                await (indexedFile as FileGroup).loadFiles();
            } else {
                indexedFile = new FlatFile(this, numericIndex, new ByteBuffer(fs.readFileSync(indexedFilePath)));
            }

            newFile.sha256 = await indexedFile.generateShaHash();
            newFile.crc = await indexedFile.generateCrc32();
            newFile.size = await indexedFile.getCompressedFileLength();

            if(!groupMetadata?.sha256) {
                // Use CRC32 if SHA256 is not available for this file
                if(groupMetadata?.crc !== newFile.crc) {
                    newFile.version++;
                }
            } else if(groupMetadata.sha256 !== newFile.sha256) {
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

        if(currentFileNames.length > 0) {
            // process newly discovered files

            let newFileIndex = this.getLastFileIndex();

            // @TODO run through existing files first, checking off any file names that we've encountered
            // @TODO then run through any remaining files to append them
            
        }


        this._manifest = newManifest;

        const indexData = await this.generateIndexFile();
        this._manifest.crc = await IndexedFile.generateCrc32(indexData);
        this._manifest.sha256 = await IndexedFile.generateShaHash(indexData);

        if(fs.existsSync(this.outputFilePath)) {
            fs.rmSync(this.outputFilePath, { recursive: true });
        }

        fs.mkdirSync(this.outputFilePath);

        writeIndexFile(this.outputFilePath, this._manifest);
    }

    /**
     * Unpacks the archive, it's manifest, and it's files.
     * @param loadFileData Whether or not to load file contents into memory. Defaults to true.
     * @param compressFileData Compress the file data if loaded. Defaults to true.
     */
    public async unpack(loadFileData: boolean = true,
                        compressFileData: boolean = true): Promise<void> {
        for(const [ index, ] of this._manifest.groups) {
            const indexedFile = await this.loadFile(index, loadFileData);

            if(loadFileData && compressFileData) {
                await indexedFile?.compress();
            }

            this.setGroup(index, indexedFile);
        }

        this.loaded = true;
    }

    /**
     * Compresses the archive's index data into a flat file for update server and client usage.
     */
    public async generateIndexFile(): Promise<ByteBuffer> {
        await this.loadManifestFile();

        const files = this._manifest.groups;
        const fileCount = files.size;

        const buffer = new ByteBuffer(1000 * 1000);
        let writtenFileIndex = 0;

        // Write index file header
        buffer.put(this.config.format ?? 5); // '5' for 'JS5' by default
        buffer.put(this.config.content?.saveFileNames ? 1 : 0);
        buffer.put(fileCount, 'short');

        // Write file indexes
        for(const [ fileIndex, ] of files) {
            const val = Number(fileIndex);
            buffer.put(val - writtenFileIndex, 'short');
            writtenFileIndex = val;
        }

        // Write name hashes (if applicable)
        if(this.config.content?.saveFileNames) {
            logger.info(`Writing file names to index ${this.archiveIndex}.`);
            for(const [ , file ] of files) {
                buffer.put(file?.nameHash ?? 0, 'int');
            }
        }

        // Write file crc values
        for(const [ , file ] of files) {
            buffer.put(file?.crc ?? 0, 'int');
        }

        // Write file version numbers
        for(const [ , file ] of files) {
            buffer.put(file?.version ?? 0, 'int');
        }

        // Write file group child counts
        for(const [ , file ] of files) {
            buffer.put(file?.fileNames?.length || 1, 'short');
        }

        // Write file group children
        for(const [ fileIndex, file ] of files) {
            const childCount = file?.fileNames?.length || 1;

            writtenFileIndex = 0;

            // Write child indexes
            for(let i = 0; i < childCount; i++) {
                if(file?.fileNames) {
                    try {
                        const childName = file.fileNames[i];
                        const index = Number(childName.substring(0, childName.lastIndexOf('.')));

                        buffer.put(index - writtenFileIndex, 'short');
                        writtenFileIndex = index;
                    } catch(error) {
                        logger.error(`Error writing child index #${i} for group ${fileIndex}`);
                        logger.error(error);
                    }
                } else {
                    buffer.put(i - writtenFileIndex, 'short');
                    writtenFileIndex = i;
                }
            }
        }

        // Write child name hashes (if applicable)
        // @TODO Single child files need a name of blank string?
        if(this.config.content?.saveFileNames) {
            const fileExtension = this.config.content?.fileExtension;

            for(const [ , file ] of files) {
                if(file?.fileNames?.length) {
                    for(let i = 0; i < file.fileNames.length; i++) {
                        const childFile = file.fileNames[i];
                        if(!childFile) {
                            buffer.put(0, 'int');
                        } else {
                            const fileName = fileExtension ? childFile.replace(fileExtension, '') : childFile;
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
        const compression = compressionKey[this.config.compression];

        return compressFile({
            buffer: archiveData,
            compression
        });
    }

    /**
     * Loads the specified file from the flat file store archive on disc.
     * @param fileIndex The index of the file to load.
     * @param loadFileData Whether or not to load the file's data into memory automatically. Defaults to true.
     */
    public async loadFile(fileIndex: number | string, loadFileData: boolean = true): Promise<FlatFile | FileGroup | null> {
        if(!this.manifest) {
            this.loadManifestFile();
        }

        let numericIndex;
        if(typeof fileIndex === 'number') {
            numericIndex = fileIndex;
            fileIndex = String(fileIndex);
        } else {
            numericIndex = Number(fileIndex);
        }

        const fileEntry: FileGroupMetadata = this.manifest.groups.get(fileIndex);
        if(!fileEntry) {
            logger.error(`File ${fileIndex} was not found within the archive manifest.`);
            return null;
        }

        const folderPath = path.join(this.filePath, fileEntry.name);
        const filePath = path.join(this.filePath, fileEntry.name + (this.config.content?.fileExtension ?? ''));
        let finalPath: string = folderPath;

        if(!fs.existsSync(folderPath)) {
            finalPath = filePath;

            if(!fs.existsSync(filePath)) {
                logger.error(`File ${fileIndex} was not found.`);
                return null;
            }
        }

        const fileStats = fs.statSync(finalPath);

        if(fileStats.isDirectory()) {
            const fileGroup = new FileGroup(this, numericIndex, fileEntry);
            if(loadFileData) {
                await fileGroup.loadFiles();
            }
            return fileGroup;
        } else {
            const fileData = loadFileData && fileStats ? new ByteBuffer(fs.readFileSync(finalPath)) : null;
            return new FlatFile(this, numericIndex, fileData);
        }
    }

    /**
     * Loads the archive's manifest and error log files from the flat file store archive on disc.
     * @param force Force re-load the manifest if it is already loaded. Defaults to false.
     */
    public loadManifestFile(force: boolean = false): ArchiveIndex | null {
        if(this.loaded && !force && this._manifest) {
            return this._manifest;
        }

        try {
            this._manifest = readIndexFile(this.filePath);
            this.loaded = true;
            return this._manifest;
        } catch(error) {
            logger.error(error);
            this._manifest = null;
            this.loaded = false;
            return null;
        }
    }

    /**
     * Adds a new or replaces an existing group within the archive.
     * @param fileIndex The index of the group to add or change.
     * @param group The group to add or change.
     */
    public setGroup(fileIndex: number | string, group: IndexedFile): void {
        this.groups.set(typeof fileIndex === 'number' ? String(fileIndex) : fileIndex, group);
    }

    /**
     * Fetches a group from this archive by index.
     * @param fileIndex The index of the group to find.
     */
    public getGroup(fileIndex: number | string): IndexedFile {
        return this.groups.get(typeof fileIndex === 'number' ? String(fileIndex) : fileIndex);
    }

    public get contentType(): ArchiveContentType {
        return this.config?.content?.type ?? 'files';
    }

    public get manifest(): ArchiveIndex {
        return this._manifest;
    }

    public get archiveName(): string {
        return this.config?.name;
    }

    public get filePath(): string {
        return path.join(this.fileStore.fileStorePath, `${this.indexName}`);
    }

    public get outputFilePath(): string {
        return path.join(this.storeOutputDir, `${this.indexName}`);
    }

    public get storeOutputDir(): string {
        return path.join(this.outputDir, 'stores');
    }

    public get outputDir(): string {
        return path.join('.', 'output');
    }

}
