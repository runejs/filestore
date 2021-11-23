import { createHash } from 'crypto';
import { Buffer } from 'buffer';
import path from 'path';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'graceful-fs';
import { logger } from '@runejs/common';
import { Js5Archive, Js5File, Js5Group, Js5Store } from '..';
import { StoreConfig } from '../../config';
import { DecompressorOptions } from './decompressor-options';
import {
    ArchiveIndex,
    GroupIndex, FileIndex,
    writeArchiveIndexFile
} from '../../flat-file-store';
 import Js5Transcoder from '../../transcoders/js5-transcoder';


export class Js5Decompressor {

    public readonly store: Js5Store;
    public readonly options: DecompressorOptions;

    public constructor(store: Js5Store, options?: DecompressorOptions) {
        this.store = store;
        this.options = DecompressorOptions.create(options);
    }

    public decompressStore(): void {
        this.store.decode();

        for(const [ archiveIndex, archive ] of this.store.archives) {
            if(archiveIndex && archive && archiveIndex !== '255') {
                this.decompressArchive(archiveIndex, archive);
            }
        }
    }

    public decompressArchive(archiveName: string): void;
    public decompressArchive(archiveIndex: string, archive: Js5Archive): void;
    public decompressArchive(archiveId: string, archive?: Js5Archive): void {
        if(!archive) {
            archive = this.store.getArchive(StoreConfig.getArchiveIndex(archiveId) ?? archiveId);
            archiveId = archive?.index;
            archive.decode();
        }

        const { name: archiveName, defaultFileNames: archiveFileNames, fileExtension } = StoreConfig.getArchiveDetails(archiveId);
        const outputPath = path.join(this.outputPath, archiveName);
        const { debug } = this.options;

        if(!debug) {
            if(existsSync(outputPath)) {
                rmSync(outputPath, { force: true, recursive: true });
            }

            mkdirSync(outputPath, { recursive: true });
        }

        const groupMetaData: Map<string, GroupIndex> = new Map<string, GroupIndex>();
        const defaultFileNameMap = archiveFileNames ?? {};
        const defaultFileNames = Object.keys(defaultFileNameMap) ?? [];
        const fileGroupNames = new Map<string, string>();

        defaultFileNames.forEach(childName => fileGroupNames.set(String(defaultFileNameMap[childName]), childName));

        for(const [ , fileGroup ] of archive.groups) {
            const groupIndex = fileGroup.numericIndex;

            if(isNaN(groupIndex)) {
                this.reportError(groupMetaData, fileGroup, `File ${groupIndex} has an invalid index`);
                continue;
            }

            if(!fileGroup) {
                this.reportError(groupMetaData, fileGroup, `File not found`);
                continue;
            }

            try {
                this.decompressGroup(groupMetaData, fileGroup, outputPath, fileExtension);
            } catch(error) {
                logger.error(error);
            }
        }

        const manifest: ArchiveIndex = {
            index: archive.numericIndex,
            crc32: archive.crc32,
            sha256: createHash('sha256').update(archive.data.toNodeBuffer()).digest('hex'),
            groups: groupMetaData
        };

        try {
            writeArchiveIndexFile(outputPath, manifest);
            logger.info(`Archive ${archiveName} written to ${outputPath}`);
        } catch(error) {
            logger.error(error);
        }
    }

    public decompressGroup(groupMetadata: Map<string, GroupIndex>, fileGroup: Js5Group,
                           outputPath: string, fileExtension?: string | undefined): GroupIndex {
        if(!fileGroup) {
            throw new Error(`Invalid file group.`);
        }

        if(!fileGroup.data?.length) {
            fileGroup.decompress();
        }

        const { debug } = this.options;
        const groupFiles = fileGroup.files;

        const { nameHash, version, crc32, sha256, size, stripeCount } = fileGroup;
        const groupName = fileGroup.name ?? String(fileGroup.nameHash ?? fileGroup.index);

        const metadata: GroupIndex = {
            name: groupName,
            nameHash,
            size,
            crc32,
            sha256,
            version,
            stripeCount,
            files: new Map<string, GroupIndex>()
        };

        groupMetadata.set(fileGroup.index, metadata);

        if(groupFiles.size > 1) {
            const folderPath = path.join(outputPath, groupName);
            if(!debug && !existsSync(folderPath)) {
                mkdirSync(folderPath);
            }

            for(const [ fileIndex, file ] of groupFiles) {
                const groupedFileIndex = file.numericIndex;
                const groupedFileName = file.name ?? String(file.nameHash ?? fileIndex);
                const fileFound: boolean = (file?.data?.length ?? 0) > 0;

                let transcodedFile = fileFound ? Js5Transcoder.decode(fileGroup.archive.name, {
                    fileIndex: fileGroup.numericIndex, fileName: groupedFileName
                }, file?.data, { debug }) : [];

                if(!file?.data?.length) {
                    this.reportError(groupMetadata, fileGroup,
                        `Grouped file ${groupedFileIndex} ${fileFound ? 'could not be decoded' : 'was not found'}`);
                    transcodedFile = Buffer.from([]);
                }

                if(!debug) {
                    writeFileSync(path.join(folderPath, groupedFileName + (fileExtension ?? '')), transcodedFile as Buffer | string);
                }

                const fileMetadata = {
                    name: groupedFileName,
                    nameHash: file.nameHash ?? undefined,
                    stripeSizes: file.stripeSizes ?? [ 0 ],
                    size: file.size ?? 0,
                    sha256: file.sha256 ?? undefined
                };
                metadata.files.set(fileIndex, fileMetadata);
            }
        } else {
            const file = groupFiles.get('0');
            const fileMetadata = this.decompressFlatFile(groupMetadata, fileGroup, groupName, outputPath, fileExtension);
            metadata.files.set('0', {
                name: fileMetadata.name,
                nameHash: fileMetadata.nameHash,
                stripeSizes: file.stripeSizes,
                size: file.size,
                sha256: file.sha256
            });
        }

        return metadata;
    }

    public decompressFlatFile(groupMetadata: Map<string, GroupIndex>, file: Js5File, groupName: string,
                              outputPath: string, fileExtension?: string | undefined): GroupIndex {
        if(!file) {
            throw new Error(`Invalid file.`);
        }

        if(!file.data?.length) {
            file.decompress();
        }

        const { debug } = this.options;

        let decodedContent = !file.empty ? Js5Transcoder.decode(file.archive.name, {
            fileIndex: file.numericIndex, fileName: groupName
        }, file.data, { debug }, true) : [];

        if(!decodedContent?.length) {
            this.reportError(groupMetadata, file, `Group ${groupName} ${!file.empty ? 'could not be decoded' : 'was not found'}`);
            decodedContent = Buffer.from([]);
        }

        const isArray: boolean = decodedContent?.length && typeof decodedContent[0] !== 'number';
        let multipleDecompressedFiles: boolean = isArray && decodedContent?.length > 1;

        try {
            if(!debug) {
                if(multipleDecompressedFiles) {
                    const groupDir = path.join(outputPath, groupName);
                    mkdirSync(groupDir);

                    for(let i = 0; i < decodedContent.length; i++) {
                        const content: Buffer = decodedContent[i] as Buffer | null;

                        if(content?.length) {
                            writeFileSync(path.join(groupDir, i + (fileExtension ?? '')), content);
                        }
                    }
                } else {
                    const content: Buffer = decodedContent[0] instanceof Buffer ? decodedContent[0] : Buffer.from(decodedContent as any[]);
                    if(content?.length) {
                        writeFileSync(path.join(outputPath, groupName + (fileExtension ?? '')), content);
                    }
                }
            }
        } catch(error) {
            logger.error(`Error writing file:`, error);
        }

        const metadata: GroupIndex = {
            name: groupName,
            nameHash: file.nameHash ?? undefined,
            size: file.size ?? 0,
            crc32: file.crc32 ?? undefined,
            sha256: file.sha256 ?? undefined,
            version: file.version ?? undefined,
            stripeCount: file.stripeCount ?? 0,
            files: new Map<string, FileIndex>()
        };

        metadata.files.set('0', {
            name: groupName,
            nameHash: file?.nameHash ?? undefined,
            stripeSizes: file.stripeSizes ?? [ 0 ],
            sha256: file.sha256 ?? undefined
        });

        return metadata;
    }

    private reportError(groupMetadata: Map<string, GroupIndex>, file: Js5File, message: string): void;
    private reportError(groupMetadata: Map<string, GroupIndex>, file: Js5File, messages: string[]): void;
    private reportError(groupMetadata: Map<string, GroupIndex>, file: Js5File, messages: string[] | string): void {
        if(!Array.isArray(messages)) {
            messages = [ messages ];
        }

        const fileInfo = groupMetadata.get(file.index);

        if(fileInfo) {
            if(fileInfo.errors) {
                fileInfo.errors.push(...messages);
            } else {
                fileInfo.errors = [ ...messages ];
            }
        } else {
            groupMetadata.set(file.index, {
                name: file?.name ?? String(file?.nameHash ?? file.index),
                nameHash: file?.nameHash ?? undefined,
                crc32: file?.crc32 ?? undefined,
                errors: [ ...messages ]
            });
        }
    }

    public get outputPath(): string {
        return this.options.outputPath;
    }

}
