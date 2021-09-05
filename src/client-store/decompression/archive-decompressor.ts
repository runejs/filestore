import * as CRC32 from 'crc-32';
import fs from 'fs';
import path from 'path';
import { Buffer } from 'buffer';
import { createHash, Hash } from 'crypto';

import { logger } from '@runejs/core';

import {
    ArchiveName,
    getArchiveConfig,
    getIndexName,
    FileGroupMetadataMap,
    ArchiveIndex,
    FileGroupMetadata, writeIndexFile, ArchiveConfig
} from '../../file-store';
import { ClientArchive } from '../client-archive';
import { extractIndexedFile } from '../data';
import { getFileName } from '../file-naming';
import Js5Transcoder from '../../transcoders/js5-transcoder';
import { DecompressionOptions } from './decompression-options';
import { ClientFileGroup } from '../client-file-group';


export class ArchiveDecompressor {

    public readonly archive: ClientArchive;
    public readonly archiveConfig: ArchiveConfig;
    public readonly decompressedMetadata: FileGroupMetadataMap;
    public readonly options: DecompressionOptions;
    public readonly hash: Hash;

    public static readonly decodedFileNames: { [key: number]: string } = {};

    public constructor(archive: ClientArchive, options?: DecompressionOptions) {
        this.archive = archive;
        this.archiveConfig = getArchiveConfig(this.archive.archiveIndex);
        this.decompressedMetadata = new Map<string, FileGroupMetadata>();
        this.options = DecompressionOptions.create(options);
        this.hash = createHash('sha256');
    }

    public static writeFileNames(): void {
        if(!Object.keys(ArchiveDecompressor.decodedFileNames).length) {
            logger.error(`No file names decoded.`);
            return;
        }

        const fileContent = JSON.stringify(ArchiveDecompressor.decodedFileNames, null, 4);
        fs.writeFileSync(path.join(ArchiveDecompressor.storeOutputDir, 'name-hashes.json'), fileContent);
    }

    // @TODO automated file verification/validation system

    public decompressFileGroup(groupIndex: string, fileGroup: ClientFileGroup, fileName: string): void {
        const { debug } = this.options;
        const fileExtension = this.archiveConfig.content?.fileExtension;

        fileGroup.decodeGroupFiles();

        const groupFiles = fileGroup.files;
        const groupFileCount = groupFiles.size;
        const numericIndex = Number(groupIndex);

        this.decompressedMetadata.set(groupIndex, {
            name: `${fileName}`,
            nameHash: fileGroup?.nameHash ?? undefined,
            size: fileGroup?.groupCompressedSize ?? 0,
            crc: fileGroup?.fileData?.length ? CRC32.buf(fileGroup.fileData) : undefined,
            sha256: fileGroup?.fileData?.length ? this.hash.update(fileGroup.fileData).digest('hex') : undefined,
            version: fileGroup?.version || undefined,
            fileNames: new Array(groupFileCount)
        });

        let childArrayIndex = 0;

        const folderPath = path.join(this.storePath, `${fileName}`);
        if(!debug && !fs.existsSync(folderPath)) {
            fs.mkdirSync(folderPath);
        }

        for(const [ groupedFileStringIndex, groupedFile ] of groupFiles) {
            const groupedFileIndex = Number(groupedFileStringIndex);
            const groupedFileName = groupedFileIndex + (groupedFile.nameHash ? '_' +
                getFileName(groupedFile.nameHash) : '');
            const fileFound: boolean = (groupedFile?.fileData?.length ?? 0) > 0;

            let transcodedFile = fileFound ? Js5Transcoder.decode(this.archive.name, {
                fileIndex: groupedFileIndex, fileName
            }, groupedFile.fileData, { debug }) : [];

            if(!groupedFile?.fileData?.length) {
                this.reportFileError(fileGroup,
                    `Grouped file ${groupedFileIndex} ${fileFound ? 'could not be decoded' : 'was not found'}`);
                transcodedFile = Buffer.from([]);
            }

            if(!debug) {
                fs.writeFileSync(path.join(folderPath, groupedFileName + fileExtension), transcodedFile as Buffer | string);
            }

            this.decompressedMetadata.get(groupIndex).fileNames[childArrayIndex++] = groupedFileName + (fileExtension ?? '');
        }
    }

    public decompressFlatFile(groupIndex: string, fileGroup: ClientFileGroup, fileName: string): void {
        const { debug } = this.options;
        const fileExtension = this.archiveConfig.content?.fileExtension;

        fileGroup.decompress();

        const fileFound: boolean = (fileGroup?.fileData?.length ?? 0) > 0;
        const numericIndex = Number(groupIndex);

        let decodedContent = fileFound ? Js5Transcoder.decode(this.archive.name, {
            fileIndex: numericIndex, fileName
        }, fileGroup.fileData, { debug }, true) : [];

        if(!decodedContent?.length) {
            this.reportFileError(fileGroup, `Group ${groupIndex} ${fileFound ? 'could not be decoded' : 'was not found'}`);
            decodedContent = Buffer.from([]);
        }

        const isArray: boolean = decodedContent?.length && typeof decodedContent[0] !== 'number';
        let isGroup: boolean = isArray && decodedContent?.length > 1;

        if(!debug) {
            if(isGroup) {
                const groupDir = path.join(this.storePath, fileGroup.name);
                fs.mkdirSync(groupDir);

                for(let i = 0; i < decodedContent.length; i++) {
                    const groupedFile = decodedContent[i] as Buffer | null;
                    if(groupedFile?.length) {
                        fs.writeFileSync(path.join(groupDir, i + (fileExtension ?? '')), groupedFile);
                    }
                }
            } else {
                try {
                    const content = decodedContent[0] instanceof Buffer ? decodedContent[0] : decodedContent as any[];
                    if(content?.length) {
                        fs.writeFileSync(path.join(this.storePath, fileGroup.name + (fileExtension ?? '')),
                            Buffer.from(content));
                    }
                } catch(error) {
                    logger.error(`Error writing file:`, error);
                }
            }
        }

        this.decompressedMetadata.set(groupIndex, {
            name: fileName,
            nameHash: fileGroup?.nameHash ?? undefined,
            size: fileGroup?.fileData?.length ?? 0,
            crc: fileGroup?.fileData?.length ? CRC32.buf(fileGroup?.fileData) : undefined,
            sha256: fileGroup?.fileData?.length ? this.hash.update(fileGroup.fileData).digest('hex') : undefined,
            version: fileGroup?.version ?? undefined,
        });
    }

    public async decompressArchive(): Promise<void> {
        const { debug, matchMapFiles } = this.options;

        if(!debug) {
            if(fs.existsSync(this.storePath)) {
                fs.rmSync(this.storePath, {
                    force: true,
                    recursive: true
                });
            }

            fs.mkdirSync(this.storePath, { recursive: true });
        }

        logger.info(`Writing ${this.storePath}...`);

        const groupCount = this.archive.groups.size;
        const defaultFileNameMap = this.archiveConfig.content?.defaultFileNames ?? {};
        const defaultFileNames = Object.keys(defaultFileNameMap) ?? [];
        const fileGroupNames = new Map<string, string>();

        defaultFileNames.forEach(childName => fileGroupNames.set(String(defaultFileNameMap[childName]), childName));

        logger.info(`${groupCount} groups found within this archive.`);

        const archiveName = getIndexName(this.archive.archiveIndex) as ArchiveName;
        let failures = 0;
        let successes = 0;

        for(const [ groupStringIndex, fileGroup ] of this.archive.groups) {
            const groupIndex = Number(groupStringIndex);

            if(isNaN(groupIndex)) {
                this.reportFileError(fileGroup, `File ${groupIndex} has an invalid index`);
                continue;
            }

            if(!fileGroup) {
                this.reportFileError(fileGroup, `File not found`);
                continue;
            }

            let fileName: string = fileGroup.nameHash !== undefined ?
                getFileName(fileGroup.nameHash) :
                fileGroupNames.get(groupStringIndex) ?? groupStringIndex;

            try {
                if(!this.archiveConfig.content?.type || this.archiveConfig.content?.type === 'groups') {
                    // Write a new directory for a group with more than 1 file
                    this.decompressFileGroup(groupStringIndex, fileGroup, fileName);
                } else {
                    // Write single file for groups with one entry
                    this.decompressFlatFile(groupStringIndex, fileGroup, fileName);
                }

                if(/[a-z]i*/.test(fileName)) {
                    ArchiveDecompressor.decodedFileNames[fileGroup.nameHash] = fileName;
                }

                if(this.decompressedMetadata.get(groupStringIndex).size > 0) {
                    successes++;
                } else {
                    // @TODO generate empty child file if none is found to keep proper index ordering
                    failures++;
                }
            } catch(error) {
                logger.error(error);
                failures++;
            }
        }

        if(successes) {
            logger.info(`${successes} file(s) were decompressed successfully.`);
        } else {
            logger.error(`No files were able to be decompressed from this archive.`);
        }

        if(failures) {
            logger.error(`${failures} file(s) failed to decompress.`);
        }

        const indexEntry = extractIndexedFile(this.archive.archiveIndex, 255, this.archive.clientStoreChannel);

        const manifest: ArchiveIndex = {
            index: this.archive.archiveIndex,
            crc: CRC32.buf(indexEntry.dataFile),
            sha256: createHash('sha256').update(indexEntry.dataFile).digest('hex'),
            version: this.archive.version, // @TODO increment if changed
            groups: this.decompressedMetadata
        };

        try {
            writeIndexFile(this.storePath, manifest);
        } catch(error) {
            logger.error(error);
        }
    }

    private reportFileError(fileGroup: ClientFileGroup, message: string): void;
    private reportFileError(fileGroup: ClientFileGroup, messages: string[]): void;
    private reportFileError(fileGroup: ClientFileGroup, messages: string[] | string): void {
        if(!Array.isArray(messages)) {
            messages = [ messages ];
        }

        const indexStr = String(fileGroup.fileIndex);
        const fileInfo = this.decompressedMetadata.get(indexStr);

        if(fileInfo) {
            if(fileInfo.errors) {
                fileInfo.errors.push(...messages);
            } else {
                fileInfo.errors = [ ...messages ];
            }
        } else {
            this.decompressedMetadata.set(indexStr, {
                name: fileGroup?.name ?? 'undefined', // so it shows up as 'undefined' in the manifest
                nameHash: fileGroup?.nameHash ?? undefined,
                crc: fileGroup?.crc ?? undefined,
                errors: [ ...messages ]
            });
        }
    }

    public static get outputDir(): string {
        return path.join('.', 'output');
    }

    public static get storeOutputDir(): string {
        return path.join(ArchiveDecompressor.outputDir, 'stores');
    }

    public get storePath(): string {
        return path.join(ArchiveDecompressor.storeOutputDir, `${this.archive.name}`);
    }

}
