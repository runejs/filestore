import * as CRC32 from 'crc-32';
import fs from 'fs';
import path from 'path';
import { Buffer } from 'buffer';
import { createHash } from 'crypto';

import { logger } from '@runejs/core';
import { ByteBuffer } from '@runejs/core/buffer';

import {
    ArchiveName,
    getArchiveConfig,
    getIndexName,
    FileGroupMetadataMap,
    ArchiveIndex,
    FileGroupMetadata, writeIndexFile
} from '../../file-store';
import { ClientArchive } from '../client-archive';
import { extractIndexedFile } from '../data';
import { getFileName } from '../file-naming';
import Js5Transcoder from '../../transcoders/js5-transcoder';
import { DecompressionOptions } from './decompression-options';


export class ArchiveDecompressor {

    public readonly archive: ClientArchive;

    public static readonly decodedFileNames: { [key: number]: string } = {};

    public constructor(archive: ClientArchive) {
        this.archive = archive;
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

    public async decompressArchive(options?: DecompressionOptions): Promise<void> {
        options = DecompressionOptions.create(options);
        const { debug, matchMapFiles } = options;

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

        const archiveConfig = getArchiveConfig(this.archive.archiveIndex);

        const fileMetadataMap: FileGroupMetadataMap = new Map<string, FileGroupMetadata>();
        const groupCount = this.archive.groups.size;
        const fileExtension = archiveConfig.content?.fileExtension;
        const defaultFileNameMap = archiveConfig.content?.defaultFileNames ?? {};
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
                this.reportFileError(fileMetadataMap, groupIndex, undefined, undefined,
                    `File ${groupIndex} has an invalid index`);
                continue;
            }

            if(!fileGroup) {
                this.reportFileError(fileMetadataMap, groupIndex, undefined, undefined, `File not found`);
                continue;
            }

            let fileName = fileGroup.nameHash !== undefined ?
                getFileName(fileGroup.nameHash) :
                fileGroupNames.get(groupStringIndex) ?? groupIndex;

            const hash = createHash('sha256');

            try {
                if(!archiveConfig.content?.type || archiveConfig.content?.type === 'groups') {
                    // Write a new directory for a group with more than 1 file

                    fileGroup.decodeGroupFiles();

                    const groupFiles = fileGroup.files;
                    const groupFileCount = groupFiles.size;

                    fileMetadataMap.set(groupStringIndex, {
                        name: `${fileName}`,
                        nameHash: fileGroup?.nameHash ?? undefined,
                        size: fileGroup?.groupCompressedSize ?? 0,
                        crc: fileGroup?.fileData?.length ? CRC32.buf(fileGroup.fileData) : undefined,
                        sha256: fileGroup?.fileData?.length ? hash.update(fileGroup.fileData).digest('hex') : undefined,
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

                        if(isNaN(groupedFileIndex)) {
                            childArrayIndex++;
                            this.reportFileError(fileMetadataMap, groupIndex, fileGroup.name, fileGroup.nameHash,
                                `Grouped file ${groupedFileIndex} has an invalid index`);
                            continue;
                        }

                        const groupedFileName = groupedFileIndex + (groupedFile.nameHash ? '_' +
                            getFileName(groupedFile.nameHash) : '');

                        const fileFound: boolean = (groupedFile?.fileData?.length ?? 0) > 0;

                        let transcodedFile = fileFound ? Js5Transcoder.decode(archiveName, {
                            fileIndex: groupedFileIndex,
                            fileName: `${fileName}`
                        }, groupedFile.fileData, { debug }) : [];

                        if(!groupedFile?.fileData?.length) {
                            this.reportFileError(fileMetadataMap, groupIndex, fileGroup.name, fileGroup.nameHash,
                                `Grouped file ${groupedFileIndex} ${fileFound ? 'could not be decoded' : 'was not found'}`);
                            transcodedFile = Buffer.from([]);
                        }

                        if(!debug) {
                            fs.writeFileSync(path.join(folderPath, groupedFileName + fileExtension), transcodedFile as Buffer | string);
                        }

                        fileMetadataMap.get(groupStringIndex).fileNames[childArrayIndex++] = groupedFileName + (fileExtension ?? '');
                    }
                } else {
                    // Write single file for groups with one entry

                    fileGroup.decompress();

                    const fileFound: boolean = (fileGroup?.fileData?.length ?? 0) > 0;

                    let decodedContent = fileFound ? Js5Transcoder.decode(archiveName, {
                        fileIndex: groupIndex,
                        fileName: `${fileName}`
                    }, fileGroup.fileData, { debug }, true) : [];

                    if(!decodedContent?.length) {
                        this.reportFileError(fileMetadataMap, groupIndex, fileGroup.name, fileGroup.nameHash,
                            `Group ${groupIndex} ${fileFound ? 'could not be decoded' : 'was not found'}`);
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

                    fileName = `${fileName}`;

                    fileMetadataMap.set(groupStringIndex, {
                        name: fileName,
                        nameHash: fileGroup?.nameHash ?? undefined,
                        size: fileGroup?.fileData?.length ?? 0,
                        crc: fileGroup?.fileData?.length ? CRC32.buf(fileGroup?.fileData) : undefined,
                        sha256: fileGroup?.fileData?.length ? hash.update(fileGroup.fileData).digest('hex') : undefined,
                        version: fileGroup?.version ?? undefined,
                    });

                    if(/[a-z]i*/.test(fileName)) {
                        ArchiveDecompressor.decodedFileNames[fileGroup.nameHash] = fileName;
                    }
                }

                if(fileMetadataMap.get(groupStringIndex).size > 0) {
                    successes++;
                } else {
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
            version: this.archive.version,
            groups: fileMetadataMap
        };

        try {
            writeIndexFile(this.storePath, manifest);
        } catch(error) {
            logger.error(error);
        }
    }

    private reportFileError(metadataMap: FileGroupMetadataMap, fileIndex: number, name: string, nameHash: number, message: string): void;
    private reportFileError(metadataMap: FileGroupMetadataMap, fileIndex: number, name: string, nameHash: number, messages: string[]): void;
    private reportFileError(metadataMap: FileGroupMetadataMap, fileIndex: number, name: string, nameHash: number, messages: string[] | string): void {
        if(!Array.isArray(messages)) {
            messages = [ messages ];
        }

        const indexStr = String(fileIndex);
        const fileInfo = metadataMap.get(indexStr);

        if(fileInfo) {
            if(fileInfo.errors) {
                fileInfo.errors.push(...messages);
            } else {
                fileInfo.errors = [ ...messages ];
            }
        } else {
            metadataMap.set(indexStr, {
                name, nameHash, errors: [ ...messages ]
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
