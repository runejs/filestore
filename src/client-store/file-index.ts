import JSZip from 'jszip';
import * as fs from 'fs';
import * as path from 'path';
import * as CRC32 from 'crc-32';
import { createHash } from 'crypto';

import { logger } from '@runejs/core';

import { ClientFileGroup } from './client-file-group';
import { ClientFile } from './client-file';
import { ClientStoreChannel, extractIndexedFile } from './data';
import { hashFileName } from './util';
import { ClientFileStore, getFileName } from './client-file-store';
import { fileExtensions, getIndexId, FileMetadata, IndexManifest, IndexName } from '../file-store/index-manifest';
import { ByteBuffer } from '@runejs/core/buffer';
import { decompressVersionedFile } from '../compression';


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
        const indexEntry = extractIndexedFile(this.indexId, 255, this.filestoreChannels);
        indexEntry.dataFile.readerIndex = 0;
        const { compression, version, buffer } = decompressVersionedFile(indexEntry.dataFile);
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

    public async generateArchive(): Promise<void> {
        if(fs.existsSync(this.storePath)) {
            fs.rmSync(this.storePath, {
                force: true,
                recursive: true
            });
        }

        if(!fs.existsSync(this.storeOutputDir)) {
            fs.mkdirSync(this.storeOutputDir, { recursive: true });
        }

        logger.info(`Writing ${this.storePath}...`);

        const storeZip = new JSZip();
        const fileCount = this.files.size;
        const fileExt = fileExtensions[this.name];

        logger.info(`${fileCount} files found within this index.`);

        const fileIndex: { [key: number]: FileMetadata } = {};
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

            const hash = createHash('sha256');

            if(file instanceof ClientFileGroup) {
                // Write sub-archive/folder

                const archive = file as ClientFileGroup;
                const folder = storeZip.folder(`${fileName}`);
                archive.decodeArchiveFiles();
                const archiveFileCount = archive.files.size;

                fileIndex[fileId] = {
                    file: `${fileName}/`,
                    realName: `${fileName}`,
                    nameHash: archive.nameHash ?? undefined,
                    version: file.version || -1,
                    crc: CRC32.buf(archive.content),
                    sha256: hash.update(archive.content).digest('hex'),
                    children: new Array(archiveFileCount)
                };

                for(let archiveFileId = 0; archiveFileId < archiveFileCount; archiveFileId++) {
                    const archiveFile = archive.getFile(archiveFileId);
                    const archiveFileName = archiveFileId + (archiveFile.nameHash ? '_' +
                        getFileName(archiveFile.nameHash) : '');

                    if(!archiveFile?.content) {
                        pushError(fileId, `File group ${fileId} not found`);
                        continue;
                    }

                    folder.file(archiveFileName + fileExt, Buffer.from(archiveFile.content));

                    fileIndex[fileId].children[archiveFileId] = archiveFileName + fileExt;
                }
            } else {
                // Write single file

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

                const fileContent = Buffer.from(decompressedFile ?? file.content);

                fileIndex[fileId] = {
                    file: fileName + fileExt,
                    realName: `${fileName}`,
                    nameHash: file.nameHash ?? undefined,
                    crc: CRC32.buf(fileContent),
                    sha256: hash.update(fileContent).digest('hex'),
                    version: file.version || -1
                };

                storeZip.file(fileName + fileExt, fileContent);
            }
        }

        const indexEntry = extractIndexedFile(this.indexId, 255, this.filestoreChannels);
        indexEntry.dataFile.readerIndex = 0;
        const indexData = decompressVersionedFile(indexEntry.dataFile).buffer;

        const manifest: IndexManifest = {
            indexId: this.indexId,
            name: this.name as IndexName,
            fileCompression: !this.compression ? 'uncompressed' : (this.compression === 1 ? 'bzip' : 'gzip'),
            fileExtension: fileExt,
            format: this.format,
            version: this.version,
            settings: this.settings,
            crc: CRC32.buf(indexData),
            sha256: createHash('sha256').update(indexData).digest('hex'),
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
        });
    }

    public get name(): string {
        return getIndexId(this.indexId) as string;
    }

    public get storePath(): string {
        return path.join(this.storeOutputDir, `${this.indexId}_${this.name}.zip`);
    }

    public get storeOutputDir(): string {
        return path.join(this.outputDir, 'stores');
    }

    public get outputDir(): string {
        return path.join('.', 'output');
    }

}
