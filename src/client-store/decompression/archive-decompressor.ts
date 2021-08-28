import { FileIndex } from '../file-index';
import fs from 'fs';
import { logger } from '@runejs/core';
import { ArchiveName, getArchiveConfig, getIndexName } from '../../file-store/archive';
import { FileErrorMap, IndexedFileMap, IndexManifest } from '../../file-store';
import { createHash } from 'crypto';
import { ClientFileGroup } from '../client-file-group';
import * as CRC32 from 'crc-32';
import path from 'path';
import { ByteBuffer } from '@runejs/core/buffer';
import { extractIndexedFile } from '../data';
import { getFileName } from '../file-naming';
import Js5Transcoder from '../../transcoders/js5-transcoder';
import { Buffer } from 'buffer';


export class ArchiveDecompressor {

    public static readonly decodedFileNames: { [key: number]: string } = {};

    public constructor(private readonly fileIndex: FileIndex) {
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

        const archiveConfig = getArchiveConfig(this.fileIndex.indexId);

        // const storeZip = new JSZip();
        const fileKeys = Array.from(this.fileIndex.files.keys());
        const fileCount = fileKeys.length;
        const fileExt = archiveConfig.fileExtension;
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

        const archiveName = getIndexName(this.fileIndex.indexId) as ArchiveName;

        for(const fileKey of fileKeys) {
            const fileIndex = Number(fileKey);
            if(isNaN(fileIndex)) {
                pushError(errors, fileIndex, undefined, undefined,
                    `File ${fileIndex} has an invalid index`);
                continue;
            }

            const file = this.fileIndex.files.get(fileIndex);

            if(!file) {
                pushError(errors, fileIndex, undefined, undefined, `File not found`);
                continue;
            }

            let fileName = file.nameHash !== undefined ?
                getFileName(file.nameHash) :
                childNames[fileIndex] ?? fileIndex;

            const hash = createHash('sha256');

            if(archiveConfig.content !== 'encoded' &&
                file instanceof ClientFileGroup &&
                !archiveConfig.flattenFileGroups) {
                // Write sub-archive/folder

                const fileGroup = file as ClientFileGroup;
                // const folder = storeZip.folder(`${fileName}`);
                fileGroup.decodeArchiveFiles();
                const groupFileKeys = Array.from(fileGroup.files.keys());
                const groupFileCount = groupFileKeys.length;

                fileIndexMap[fileIndex] = {
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

                    if(!debug) {
                        const transcodedFile = Js5Transcoder.decode(archiveName, {
                            fileIndex: groupedFileIndex,
                            fileName: `${fileName}`
                        }, groupedFile.content, { debug });

                        if(transcodedFile?.length) {
                            fs.writeFileSync(path.join(folderPath, groupedFileName + fileExt), transcodedFile as Buffer | string);
                        } else {
                            pushError(errors, groupedFileIndex, file.name, file.nameHash,
                                `Grouped file ${groupedFileIndex} transcoding failed`);
                            continue;
                        }
                    }

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

                const decodedContent = Js5Transcoder.decode(archiveName, {
                    fileIndex,
                    fileName: `${fileName}`
                }, fileContents, { debug }, true);

                if(!decodedContent?.length) {
                    pushError(errors, fileIndex, file.name, file.nameHash, `Error decoding file content`);
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

                fileIndexMap[fileIndex] = {
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

        const indexEntry = extractIndexedFile(this.fileIndex.indexId, 255, this.fileIndex.filestoreChannels);

        const manifest: IndexManifest = {
            index: this.fileIndex.indexId,
            crc: CRC32.buf(indexEntry.dataFile),
            sha256: createHash('sha256').update(indexEntry.dataFile).digest('hex'),
            version: this.fileIndex.version,
            files: fileIndexMap
        };

        if(Object.keys(errors).length) {
            manifest.errors = errors;
        }

        // storeZip.file(`.manifest.json`, JSON.stringify(manifest, null, 4));
        fs.writeFileSync(path.join(this.storePath, `.index`), JSON.stringify(manifest, null, 4));

        // vvv now stored inline within the .index file
        /*if(Object.keys(errors).length) {
            // storeZip.file(`.error-log.json`, JSON.stringify(errors, null, 4));
            fs.writeFileSync(path.join(this.storePath, `.errors`), JSON.stringify(errors, null, 4));
        }*/

        /*await new Promise<void>(resolve => {
            storeZip.generateNodeStream({ type: 'nodebuffer', streamFiles: true })
                .pipe(fs.createWriteStream(this.storePath))
                .on('finish', () => {
                    logger.info(`${this.storePath} written.`);
                    resolve();
                });
        });*/
    }

    public static get outputDir(): string {
        return path.join('.', 'output');
    }

    public static get storeOutputDir(): string {
        return path.join(ArchiveDecompressor.outputDir, 'stores');
    }

    public get storePath(): string {
        return path.join(ArchiveDecompressor.storeOutputDir, `${this.fileIndex.name}`);
    }

}
