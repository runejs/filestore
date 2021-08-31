import * as CRC32 from 'crc-32';
import fs from 'fs';
import path from 'path';
import { Buffer } from 'buffer';
import { createHash } from 'crypto';

import { logger } from '@runejs/core';
import { ByteBuffer } from '@runejs/core/buffer';

import { ArchiveName, getArchiveConfig, getIndexName, FileGroupMetadataMap, IndexManifest } from '../../file-store';
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

        const fileMetadataMap: FileGroupMetadataMap = {};
        const groupCount = this.archive.groups.size;
        const fileExtension = archiveConfig.fileExtension;
        const childNameMap = archiveConfig.children;
        let fileGroupNames: { [key: number]: string } = {};

        if(childNameMap && Object.keys(childNameMap).length) {
            Object.keys(childNameMap).forEach(childName => fileGroupNames[childNameMap[childName]] = childName);
        }

        logger.info(`${groupCount} groups found within this archive.`);

        const archiveName = getIndexName(this.archive.archiveIndex) as ArchiveName;
        let failures = 0;

        for(const [ groupIndex, fileGroup ] of this.archive.groups) {
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
                fileGroupNames[`${groupIndex}`] ?? groupIndex;

            const hash = createHash('sha256');

            try {
                if(!fileGroup.singleFile) {
                    fileGroup.decodeGroupFiles();
                } else {
                    fileGroup.decompress();
                }

                if(!fileGroup.singleFile && archiveConfig.content !== 'encoded' && !archiveConfig.flattenFileGroups) {
                    // Write a new directory for a group with more than 1 file

                    const groupFiles = fileGroup.files;
                    const groupFileCount = groupFiles.size;

                    fileMetadataMap[groupIndex] = {
                        name: `${fileName}`,
                        nameHash: fileGroup.nameHash ?? undefined,
                        size: fileGroup.groupCompressedSize ?? 0,
                        crc: CRC32.buf(fileGroup.fileData),
                        sha256: hash.update(fileGroup.fileData).digest('hex'),
                        version: fileGroup.version || -1,
                        fileNames: new Array(groupFileCount)
                    };

                    let childArrayIndex = 0;

                    const folderPath = path.join(this.storePath, `${fileName}`);
                    if(!debug && !fs.existsSync(folderPath)) {
                        fs.mkdirSync(folderPath);
                    }

                    for(const [ groupedFileIndex, groupedFile ] of groupFiles) {
                        if(isNaN(groupedFileIndex)) {
                            childArrayIndex++;
                            this.reportFileError(fileMetadataMap, groupIndex, fileGroup.name, fileGroup.nameHash,
                                `Grouped file ${groupedFileIndex} has an invalid index`);
                            continue;
                        }

                        if(!groupedFile?.fileData) {
                            this.reportFileError(fileMetadataMap, groupIndex, fileGroup.name, fileGroup.nameHash,
                                `Grouped file ${groupedFileIndex} not found`);
                            continue;
                        }

                        const groupedFileName = groupedFileIndex + (groupedFile.nameHash ? '_' +
                            getFileName(groupedFile.nameHash) : '');

                        // folder.fileGroup(groupedFileName + fileExtension, Buffer.from(groupedFile.content));

                        if(!debug) {
                            const transcodedFile = Js5Transcoder.decode(archiveName, {
                                fileIndex: groupedFileIndex,
                                fileName: `${fileName}`
                            }, groupedFile.fileData, { debug });

                            if(transcodedFile?.length) {
                                fs.writeFileSync(path.join(folderPath, groupedFileName + fileExtension), transcodedFile as Buffer | string);
                            } else {
                                this.reportFileError(fileMetadataMap, groupIndex, fileGroup.name, fileGroup.nameHash,
                                    `Grouped file ${groupedFileIndex} transcoding failed`);
                                continue;
                            }
                        }

                        if(groupedFileIndex !== childArrayIndex) {
                            // logger.warn(`Grouped file ${childArrayIndex} is out of order - expected ${groupedFileIndex}`);
                        }

                        fileMetadataMap[groupIndex].fileNames[childArrayIndex++] = groupedFileName + (fileExtension ?? '');
                    }
                } else {
                    // Write single file for groups with one entry

                    if(!fileGroup?.fileData) {
                        this.reportFileError(fileMetadataMap, groupIndex, fileGroup.name, fileGroup.nameHash,
                            `Error decompressing group ${groupIndex}`);
                        continue;
                    }

                    const decodedContent = Js5Transcoder.decode(archiveName, {
                        fileIndex: groupIndex,
                        fileName: `${fileName}`
                    }, fileGroup.fileData, { debug }, true);

                    if(!decodedContent?.length) {
                        this.reportFileError(fileMetadataMap, groupIndex, fileGroup.name, fileGroup.nameHash,
                            `Error decoding file content`);
                        continue;
                    }

                    const isArray: boolean = typeof decodedContent[0] !== 'number';
                    let isGroup: boolean = isArray && decodedContent.length > 1;

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

                    fileMetadataMap[groupIndex] = {
                        name: fileName,
                        nameHash: fileGroup.nameHash ?? undefined,
                        size: fileGroup.fileData.length,
                        crc: CRC32.buf(fileGroup.fileData),
                        sha256: hash.update(fileGroup.fileData).digest('hex'),
                        version: fileGroup.version || -1,
                    };

                    if(/[a-z]i*/.test(fileName)) {
                        ArchiveDecompressor.decodedFileNames[fileGroup.nameHash] = fileName;
                    }
                }
            } catch(error) {
                logger.error(error);
                failures++;
            }
        }

        if(failures) {
            logger.error(`${failures} file(s) failed to decompress.`);
        }

        const indexEntry = extractIndexedFile(this.archive.archiveIndex, 255, this.archive.clientStoreChannel);

        const manifest: IndexManifest = {
            index: this.archive.archiveIndex,
            crc: CRC32.buf(indexEntry.dataFile),
            sha256: createHash('sha256').update(indexEntry.dataFile).digest('hex'),
            version: this.archive.version,
            groups: fileMetadataMap
        };

        fs.writeFileSync(path.join(this.storePath, `.index`), JSON.stringify(manifest, null, 4));
    }

    private reportFileError(metadataMap: FileGroupMetadataMap, fileIndex: number, name: string, nameHash: number, message: string): void;
    private reportFileError(metadataMap: FileGroupMetadataMap, fileIndex: number, name: string, nameHash: number, messages: string[]): void;
    private reportFileError(metadataMap: FileGroupMetadataMap, fileIndex: number, name: string, nameHash: number, messages: string[] | string): void {
        if(!Array.isArray(messages)) {
            messages = [ messages ];
        }

        if(metadataMap[fileIndex]) {
            if(metadataMap[fileIndex].errors) {
                metadataMap[fileIndex].errors.push(...messages);
            } else {
                metadataMap[fileIndex].errors = [ ...messages ];
            }
        } else {
            metadataMap[fileIndex] = {
                name, nameHash, errors: [ ...messages ]
            };
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
