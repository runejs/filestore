import JSZip from 'jszip';
import * as fs from 'fs';
import * as path from 'path';
import * as CRC32 from 'crc-32';
import { createHash } from 'crypto';

import { logger } from '@runejs/core';

import { ClientFileGroup } from './client-file-group';
import { ClientFile } from './client-file';
import { ClientStoreChannel, ExtractedFile, extractIndexedFile } from './data';
import { hashFileName } from './util';
import { ClientFileStore, getFileName } from './client-file-store';
import {
    IndexManifest,
    IndexedFileMap, FileErrorMap
} from '../file-store';
import { ByteBuffer } from '@runejs/core/buffer';
import { decompressFile } from '../compression';
import { ArchiveName, getArchiveConfig, getIndexName, IndexName } from '../file-store/archive';
import { decode, encode } from '../codec/archives';


const NAME_FLAG = 0x01;


export class FileIndex {

    /**
     * The client file store instance for reference.
     */
    public readonly clientFileStore: ClientFileStore;

    /**
     * The ID of this File Index.
     */
    public readonly indexId: number;

    /**
     * The file format used by the File Index.
     */
    public format: number;

    /**
     * The current version of the File Index, if versioned.
     */
    public version: number;

    /**
     * The method used by the File Index for data compression.
     */
    public compression: number;

    /**
     * Additional settings and information about the File Index (name & whirlpool information).
     */
    public settings: number;

    /**
     * A map of all files housed within this File Index. Values are either an `Archive` or `FileData` object.
     */
    public files: Map<number, ClientFileGroup | ClientFile> = new Map<number, ClientFileGroup | ClientFile>();

    private readonly filestoreChannels: ClientStoreChannel;

    /**
     * Creates a new File Index with the specified index ID and filestore channel.
     * @param clientFileStore The client file store instance for reference.
     * @param indexId The ID of this File Index.
     * @param filestoreChannels The main filestore channel for data access.
     */
    public constructor(clientFileStore: ClientFileStore, indexId: number, filestoreChannels: ClientStoreChannel) {
        this.clientFileStore = clientFileStore;
        this.indexId = indexId;
        this.filestoreChannels = filestoreChannels;
    }

    /**
     * Fetches a single file from this index.
     * @param fileId The ID of the file to fetch.
     * @returns The requested FileData object, or null if no matching file was found.
     */
    public getFile(fileId: number): ClientFile | null;

    /**
     * Fetches a single file from this index.
     * @param fileName The name of the file to fetch.
     * @returns The requested FileData object, or null if no matching file was found.
     */
    public getFile(fileName: string): ClientFile | null;

    /**
     * Fetches a single file from this index.
     * @param fileIdOrName The ID or name of the file to fetch.
     * @param keys The XTEA keys.
     * @returns The requested FileData object, or null if no matching file was found.
     */
    public getFile(fileIdOrName: number | string, keys?: number[]): ClientFile | null;
    public getFile(fileIdOrName: number | string, keys?: number[]): ClientFile | null {
        let fileData: ClientFile;

        if(typeof fileIdOrName === 'string') {
            fileData = this.findByName(fileIdOrName) as ClientFile;
        } else {
            const archiveId = fileIdOrName as number;
            fileData = this.files.get(archiveId) as ClientFile;
        }

        if(!fileData) {
            return null;
        }

        if(fileData.type === 'archive') {
            logger.error(fileData);
            throw new Error(`Requested item ${fileIdOrName} in index ${this.indexId} is of type Archive, not FileData.`);
        }

        try {
            fileData.decompress();
        } catch (e) {
            logger.warn(`Unable to decompress file ${fileIdOrName} in index ${this.indexId} with keys ${keys}`);
            return null;
        }

        return fileData;
    }

    /**
     * Fetches an archive from this index.
     * @param archiveId The ID of the archive to fetch.
     * @returns The requested Archive object, or null if no Archive was found.
     */
    public getArchive(archiveId: number): ClientFileGroup | null;

    /**
     * Fetches an archive from this index.
     * @param archiveName The name of the archive to fetch.
     * @returns The requested Archive object, or null if no Archive was found.
     */
    public getArchive(archiveName: string): ClientFileGroup | null;

    /**
     * Fetches an archive from this index.
     * @param archiveIdOrName The ID or name of the archive to fetch.
     * @returns The requested Archive object, or null if no Archive was found.
     */
    public getArchive(archiveIdOrName: number | string): ClientFileGroup | null;
    public getArchive(archiveIdOrName: number | string): ClientFileGroup | null {
        let archive: ClientFileGroup;

        if(typeof archiveIdOrName === 'string') {
            archive = this.findByName(archiveIdOrName) as ClientFileGroup;
        } else {
            const archiveId = archiveIdOrName as number;
            archive = this.files.get(archiveId) as ClientFileGroup;
        }

        if(!archive) {
            return null;
        }

        if(archive.type === 'file') {
            throw new Error(`Requested item ${archiveIdOrName} in index ${this.indexId} is of type FileData, not Archive.`);
        }

        archive.decodeArchiveFiles();

        return archive;
    }

    /**
     * Fetches an archive or file from this index by name.
     * @param fileName The name of the archive or file to search for.
     * @returns An Archive or FileData object, or null if no matching files were found with the specified name.
     */
    public findByName(fileName: string): ClientFileGroup | ClientFile | null {
        const indexFileCount = this.files.size;
        const nameHash = hashFileName(fileName);
        for(let fileId = 0; fileId < indexFileCount; fileId++) {
            const item = this.files.get(fileId);
            if(item?.nameHash === nameHash) {
                return item;
            }
        }

        return null;
    }

    /**
     * Decodes the packed index file data from the filestore on disk.
     */
    public decodeIndex(): void {
        let indexEntry: ExtractedFile | undefined;

        try {
            indexEntry = extractIndexedFile(this.indexId, 255, this.filestoreChannels);
            indexEntry.dataFile.readerIndex = 0;
        } catch(error) {
            logger.error(`Error decoding index ${this.indexId}:`);
            logger.error(error);
            return;
        }

        const { compression, version, buffer } = decompressFile(indexEntry.dataFile);
        buffer.readerIndex = 0;

        this.version = version;
        this.compression = compression; // index manifests are also compressed to the same level as standard files

        /* file header */
        this.format = buffer.get('byte', 'unsigned');
        this.settings = buffer.get('byte', 'unsigned');
        const fileCount = buffer.get('short', 'unsigned');

        /* file ids */
        const ids: number[] = new Array(fileCount);
        let accumulator = 0;
        for(let i = 0; i < ids.length; i++) {
            let delta = buffer.get('short', 'unsigned');
            ids[i] = accumulator += delta;
        }

        for(const id of ids) {
            this.files.set(id, new ClientFile(id, this, this.filestoreChannels));
        }

        /* read the name hashes if present */
        if((this.settings & NAME_FLAG) !== 0) {
            for(const id of ids) {
                const nameHash = buffer.get('int');
                this.files.get(id).nameHash = nameHash;
            }
        }

        /* read the crc values */
        for(const id of ids) {
            this.files.get(id).crc = buffer.get('int');
        }

        /* read the version numbers */
        for(const id of ids) {
            this.files.get(id).version = buffer.get('int');
        }

        /* read the child count */
        const members: number[][] = new Array(ids.length).fill([]);
        for(const id of ids) {
            members[id] = new Array(buffer.get('short', 'unsigned'));
        }

        /* read the child ids */
        for(const id of ids) {
            accumulator = 0;

            for(let i = 0; i < members[id].length; i++) {
                let delta = buffer.get('short', 'unsigned');
                members[id][i] = accumulator += delta;
            }

            /* allocate specific entries within the array */
            const file = this.files.get(id);
            if(members[id].length > 1) {
                if(file.type === 'file') {
                    this.files.set(id, new ClientFileGroup(file, this, this.filestoreChannels));
                }

                const archive = this.files.get(id) as ClientFileGroup;

                for(const childId of members[id]) {
                    archive.files.set(childId, new ClientFile(childId, this, this.filestoreChannels));
                }
            }
        }

        /* read the child name hashes */
        if((this.settings & NAME_FLAG) !== 0) {
            for(const id of ids) {
                const archive = this.files.get(id) as ClientFileGroup;
                for(const childId of members[id]) {
                    const nameHash = buffer.get('int');
                    if(archive?.files?.get(childId)) {
                        archive.files.get(childId).nameHash = nameHash;
                    }
                }
            }
        }
    }

    /**
     * Generates a zip archive of this client cache archive, containing all of it's indexed files.
     * @param matchMapFiles Defaults to false - Whether or not to ensure that map files have matching decrypted
     * landscape files. Setting this to true will remove all map files (mX_Y.dat) for which the corresponding
     * landscape file (if it has one) does not have any XTEA encryption keys. This helps with finding map files
     * that specifically have valid corresponding landscape files.
     */
    public async decompressArchive(matchMapFiles: boolean = false): Promise<void> {
        if(fs.existsSync(this.storePath)) {
            fs.rmSync(this.storePath, {
                force: true,
                recursive: true
            });
        }

        fs.mkdirSync(this.storePath, { recursive: true });

        logger.info(`Writing ${this.storePath}...`);

        const archiveConfig = getArchiveConfig(this.indexId);

        // const storeZip = new JSZip();
        const fileKeys = Array.from(this.files.keys());
        const fileCount = fileKeys.length;
        const fileExt = archiveConfig.fileExtension;
        const flattenFileGroups = archiveConfig.flattenFileGroups;
        const childNameMap = archiveConfig.children;
        let childNames: { [key: number]: string } = {};

        if(childNameMap && Object.keys(childNameMap).length) {
            Object.keys(childNameMap).forEach(childName => childNames[childNameMap[childName]] = childName);
        }

        logger.info(`${fileCount} files found within this index.`);

        const fileIndexMap: IndexedFileMap = {};
        const errors: FileErrorMap = {};

        const pushError = (errors: FileErrorMap, fileIdx: number, name: string, nameHash: number, error) => {
            // logger.error(error);

            if(errors[fileIdx]) {
                errors[fileIdx].errors.push(error);
            } else {
                errors[fileIdx] = {
                    name, nameHash, errors: [ error ]
                };
            }
        }

        const archiveName = getIndexName(this.indexId) as ArchiveName;

        for(const fileKey of fileKeys) {
            const fileIndex = Number(fileKey);
            if(isNaN(fileIndex)) {
                pushError(errors, fileIndex, undefined, undefined,
                    `File ${fileIndex} has an invalid index`);
                continue;
            }

            const file = this.files.get(fileIndex);

            if(!file) {
                pushError(errors, fileIndex, undefined, undefined, `File not found`);
                continue;
            }

            const fileName = file.nameHash ? getFileName(file.nameHash) : childNames[fileIndex] ?? fileIndex;

            const hash = createHash('sha256');

            if(file instanceof ClientFileGroup && !flattenFileGroups) {
                // Write sub-archive/folder

                const fileGroup = file as ClientFileGroup;
                // const folder = storeZip.folder(`${fileName}`);
                fileGroup.decodeArchiveFiles();
                const groupFileKeys = Array.from(fileGroup.files.keys());
                const groupFileCount = groupFileKeys.length;

                fileIndexMap[fileIndex] = {
                    file: `${fileName}/`,
                    realName: `${fileName}`,
                    fileSize: fileGroup.groupCompressedSize ?? 0,
                    nameHash: fileGroup.nameHash ?? undefined,
                    version: file.version || -1,
                    crc: CRC32.buf(fileGroup.content),
                    sha256: hash.update(fileGroup.content).digest('hex'),
                    children: new Array(groupFileCount)
                };

                let childArrayIndex = 0;

                const folderPath = path.join(this.storePath, `${fileName}`);
                if(!fs.existsSync(folderPath)) {
                    fs.mkdirSync(folderPath);
                }

                for(const groupedFileKey of groupFileKeys) {
                    const groupedFileIndex = Number(groupedFileKey);
                    if(isNaN(groupedFileIndex)) {
                        childArrayIndex++;
                        pushError(errors, groupedFileIndex, file.name, file.nameHash,
                            `Grouped file ${groupedFileIndex} has an invalid index`);
                        continue;
                    }

                    const groupedFile = fileGroup.getFile(groupedFileIndex);
                    const groupedFileName = groupedFileIndex + (groupedFile.nameHash ? '_' +
                        getFileName(groupedFile.nameHash) : '');

                    if(!groupedFile?.content) {
                        pushError(errors, groupedFileIndex, file.name, file.nameHash,
                            `Grouped file ${groupedFileIndex} not found`);
                        continue;
                    }

                    // folder.file(groupedFileName + fileExt, Buffer.from(groupedFile.content));

                    fs.writeFileSync(path.join(folderPath, groupedFileName + fileExt), decode(archiveName, groupedFile.content) as Buffer);

                    if(groupedFileIndex !== childArrayIndex) {
                        logger.warn(`Grouped file ${childArrayIndex} is out of order - expected ${groupedFileIndex}`);
                    }

                    fileIndexMap[fileIndex].children[childArrayIndex++] = groupedFileName + (fileExt ?? '');
                }
            } else {
                // Write single file

                let decompressedFile: ByteBuffer;

                try {
                    decompressedFile = file.decompress();
                } catch(error) {
                    if(error?.message === 'MISSING_ENCRYPTION_KEYS') {
                        pushError(errors, fileIndex, file.name, file.nameHash, `Missing encryption keys for file ${fileIndex}`);
                    }
                }

                const fileContents = decompressedFile ?? file.content;

                if(!fileContents) {
                    pushError(errors, fileIndex, file.name, file.nameHash, `File not found`);
                    continue;
                }

                const decodedContent = decode(archiveName, fileContents);

                if(!decodedContent?.length) {
                    pushError(errors, fileIndex, file.name, file.nameHash, `Error decoding file content`);
                    continue;
                }

                const isArray = typeof decodedContent[0] !== 'number';

                if(isArray && decodedContent.length > 1) {
                    const groupDir = path.join(this.storePath, file.name);
                    fs.mkdirSync(groupDir);

                    for(let i = 0; i < decodedContent.length; i++) {
                        const groupedFile = decodedContent[i] as Buffer | null;
                        if(groupedFile?.length) {
                            fs.writeFileSync(path.join(groupDir, i + (fileExt ?? '')), groupedFile);
                        }
                    }
                } else {
                    try {
                        const content = decodedContent[0] instanceof Buffer ? decodedContent[0] : decodedContent as any[];
                        if(content?.length) {
                            fs.writeFileSync(path.join(this.storePath, file.name + (fileExt ?? '')),
                                Buffer.from(content));
                        }
                    } catch(error) {
                        logger.error(`Error writing file:`, error);
                    }
                }

                fileIndexMap[fileIndex] = {
                    file: fileName + (fileExt ?? ''),
                    realName: `${fileName}`,
                    fileSize: fileContents.length,
                    nameHash: file.nameHash ?? undefined,
                    crc: CRC32.buf(fileContents),
                    sha256: hash.update(fileContents).digest('hex'),
                    version: file.version || -1
                };
            }
        }

        const indexEntry = extractIndexedFile(this.indexId, 255, this.filestoreChannels);

        const manifest: IndexManifest = {
            indexId: this.indexId,
            name: this.name as IndexName,
            fileCompression: !this.compression ? 'uncompressed' : (this.compression === 1 ? 'bzip' : 'gzip'),
            fileExtension: fileExt ?? undefined,
            format: this.format,
            version: this.version,
            settings: this.settings,
            crc: CRC32.buf(indexEntry.dataFile),
            sha256: createHash('sha256').update(indexEntry.dataFile).digest('hex'),
            files: fileIndexMap
        };

        // storeZip.file(`.manifest.json`, JSON.stringify(manifest, null, 4));
        fs.writeFileSync(path.join(this.storePath, `.manifest.json`), JSON.stringify(manifest, null, 4));

        if(Object.keys(errors).length) {
            // storeZip.file(`.error-log.json`, JSON.stringify(errors, null, 4));
            fs.writeFileSync(path.join(this.storePath, `.errors.json`), JSON.stringify(errors, null, 4));
        }

        /*await new Promise<void>(resolve => {
            storeZip.generateNodeStream({ type: 'nodebuffer', streamFiles: true })
                .pipe(fs.createWriteStream(this.storePath))
                .on('finish', () => {
                    logger.info(`${this.storePath} written.`);
                    resolve();
                });
        });*/
    }

    public get name(): string {
        return getIndexName(this.indexId) as string;
    }

    public get storePath(): string {
        return path.join(this.storeOutputDir, `${this.name}`);
    }

    public get storeOutputDir(): string {
        return path.join(this.outputDir, 'stores');
    }

    public get outputDir(): string {
        return path.join('.', 'output');
    }

}
