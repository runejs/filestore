import * as CRC32 from 'crc-32';
import fs from 'fs';
import path from 'path';
import { Buffer } from 'buffer';
import { createHash } from 'crypto';

import { logger } from '@runejs/core';
import { ByteBuffer } from '@runejs/core/buffer';

import { ArchiveName, getArchiveConfig, getIndexName, FileMetadata, FileMetadataMap, IndexManifest } from '../../file-store';
import { ClientArchive } from '../client-archive';
import { ClientFileGroup } from '../client-file-group';
import { extractIndexedFile } from '../data';
import { getFileName } from '../file-naming';
import Js5Transcoder from '../../transcoders/js5-transcoder';


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

    public async decompressArchive(matchMapFiles: boolean = false, debug: boolean = false): Promise<void> {
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

        const fileMetadataMap: FileMetadataMap = new Map<number, FileMetadata>();
        const fileKeys = Array.from(this.archive.files.keys());
        const fileCount = this.archive.files.size;
        const fileExt = archiveConfig.fileExtension;
        const childNameMap = archiveConfig.children;
        let childNames: { [key: number]: string } = {};

        if(childNameMap && Object.keys(childNameMap).length) {
            Object.keys(childNameMap).forEach(childName => childNames[childNameMap[childName]] = childName);
        }

        logger.info(`${fileCount} files found within this archive.`);

        const archiveName = getIndexName(this.archive.archiveIndex) as ArchiveName;

        for(const fileKey of fileKeys) {
            const fileIndex = Number(fileKey);
            if(isNaN(fileIndex)) {
                this.reportFileError(fileMetadataMap, fileIndex, undefined, undefined,
                    `File ${fileIndex} has an invalid index`);
                continue;
            }

            const file = this.archive.files.get(fileIndex);

            if(!file) {
                this.reportFileError(fileMetadataMap, fileIndex, undefined, undefined, `File not found`);
                continue;
            }

            let fileName = file.nameHash !== undefined ?
                getFileName(file.nameHash) :
                childNames[fileIndex] ?? fileIndex;

            const hash = createHash('sha256');

            if(archiveConfig.content !== 'encoded' && file instanceof ClientFileGroup && !archiveConfig.flattenFileGroups) {
                // Write sub-archive/folder

                const fileGroup = file as ClientFileGroup;
                // const folder = storeZip.folder(`${fileName}`);
                fileGroup.decodeArchiveFiles();
                const groupFileKeys = Array.from(fileGroup.children.keys());
                const groupFileCount = groupFileKeys.length;

                fileMetadataMap[fileIndex] = {
                    name: `${fileName}/`,
                    nameHash: fileGroup.nameHash ?? undefined,
                    size: fileGroup.groupCompressedSize ?? 0,
                    crc: CRC32.buf(fileGroup.content),
                    sha256: hash.update(fileGroup.content).digest('hex'),
                    version: file.version || -1,
                    children: new Array(groupFileCount)
                };

                let childArrayIndex = 0;

                const folderPath = path.join(this.storePath, `${fileName}`);
                if(!debug && !fs.existsSync(folderPath)) {
                    fs.mkdirSync(folderPath);
                }

                for(const groupedFileKey of groupFileKeys) {
                    const groupedFileIndex = Number(groupedFileKey);
                    if(isNaN(groupedFileIndex)) {
                        childArrayIndex++;
                        this.reportFileError(fileMetadataMap, groupedFileIndex, file.name, file.nameHash,
                            `Grouped file ${groupedFileIndex} has an invalid index`);
                        continue;
                    }

                    const groupedFile = fileGroup.getFile(groupedFileIndex);
                    const groupedFileName = groupedFileIndex + (groupedFile.nameHash ? '_' +
                        getFileName(groupedFile.nameHash) : '');

                    if(!groupedFile?.content) {
                        this.reportFileError(fileMetadataMap, groupedFileIndex, file.name, file.nameHash,
                            `Grouped file ${groupedFileIndex} not found`);
                        continue;
                    }

                    // folder.file(groupedFileName + fileExt, Buffer.from(groupedFile.content));

                    if(!debug) {
                        const transcodedFile = Js5Transcoder.decode(archiveName, {
                            fileIndex: groupedFileIndex,
                            fileName: `${fileName}`
                        }, groupedFile.content, { debug });

                        if(transcodedFile?.length) {
                            fs.writeFileSync(path.join(folderPath, groupedFileName + fileExt), transcodedFile as Buffer | string);
                        } else {
                            this.reportFileError(fileMetadataMap, groupedFileIndex, file.name, file.nameHash,
                                `Grouped file ${groupedFileIndex} transcoding failed`);
                            continue;
                        }
                    }

                    if(groupedFileIndex !== childArrayIndex) {
                        logger.warn(`Grouped file ${childArrayIndex} is out of order - expected ${groupedFileIndex}`);
                    }

                    fileMetadataMap[fileIndex].children[childArrayIndex++] = groupedFileName + (fileExt ?? '');
                }
            } else {
                // Write single file

                let decompressedFile: ByteBuffer;

                try {
                    decompressedFile = file.decompress();
                } catch(error) {
                    if(error?.message === 'MISSING_ENCRYPTION_KEYS') {
                        this.reportFileError(fileMetadataMap, fileIndex, file.name, file.nameHash,
                            `Missing encryption keys for file ${fileIndex}`);
                    }
                }

                const fileContents = decompressedFile ?? file.content;

                if(!fileContents) {
                    this.reportFileError(fileMetadataMap, fileIndex, file.name, file.nameHash, `File not found`);
                    continue;
                }

                const decodedContent = Js5Transcoder.decode(archiveName, {
                    fileIndex,
                    fileName: `${fileName}`
                }, fileContents, { debug }, true);

                if(!decodedContent?.length) {
                    this.reportFileError(fileMetadataMap, fileIndex, file.name, file.nameHash, `Error decoding file content`);
                    continue;
                }

                const isArray: boolean = typeof decodedContent[0] !== 'number';
                let isGroup: boolean = isArray && decodedContent.length > 1;

                if(!debug) {
                    if(isGroup) {
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
                }

                fileName = `${fileName}`;

                fileMetadataMap[fileIndex] = {
                    name: fileName + (isGroup ? '/' : ''),
                    nameHash: file.nameHash ?? undefined,
                    size: fileContents.length,
                    crc: CRC32.buf(fileContents),
                    sha256: hash.update(fileContents).digest('hex'),
                    version: file.version || -1
                };

                if(/[a-z]i*/.test(fileName)) {
                    ArchiveDecompressor.decodedFileNames[file.nameHash] = fileName;
                }
            }
        }

        const indexEntry = extractIndexedFile(this.archive.archiveIndex, 255, this.archive.filestoreChannels);

        const manifest: IndexManifest = {
            index: this.archive.archiveIndex,
            crc: CRC32.buf(indexEntry.dataFile),
            sha256: createHash('sha256').update(indexEntry.dataFile).digest('hex'),
            version: this.archive.version,
            files: fileMetadataMap
        };

        fs.writeFileSync(path.join(this.storePath, `.index`), JSON.stringify(manifest, null, 4));
    }

    private reportFileError(metadataMap: FileMetadataMap, fileIndex: number, name: string, nameHash: number, message: string): void;
    private reportFileError(metadataMap: FileMetadataMap, fileIndex: number, name: string, nameHash: number, messages: string[]): void;
    private reportFileError(metadataMap: FileMetadataMap, fileIndex: number, name: string, nameHash: number, messages: string[] | string): void {
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
