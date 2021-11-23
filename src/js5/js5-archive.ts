import { logger } from '@runejs/common';
import { Js5Store } from './js5-store';
import { Js5Group } from './js5-group';
import { Js5File } from './js5-file';
import { ArchiveDetails, StoreConfig } from '../config';
import { AssetFile, FileOptions } from '../fs';
import { FileCompression } from '@runejs/common/compression';


export class Js5Archive extends Js5File {

    public readonly groups: Map<string, Js5Group>;
    public readonly details: ArchiveDetails;

    private _format: number;
    private _filesNamed: boolean;

    public constructor(js5Store: Js5Store, index: string | number, archive?: Js5Archive) {
        super(index, js5Store, archive, {
            encryption: 'none',
            encrypted: false
        });
        this.groups = new Map<string, Js5Group>();
        this.details = StoreConfig.getArchiveDetails(this.index);
        if(!this.details) {
            throw new Error(`Unknown archive index ${index} found.`);
        }
    }

    public decode(decodeGroups: boolean = true): void {
        AssetFile.xteaMissingKeys = 0;
        this._nameHash = StoreConfig.hashFileName(this.details.name);
        this._name = this.details.name;

        if(this.index === '255') {
            return;
        }

        logger.info(`Decoding archive ${this.name}...`);

        this.extractPackedFile();
        this.generateCrc32();

        logger.info(`Archive ${this.name ?? this.index} calculated checksum: ${this.crc32}`);

        const archiveData = this.decompress();

        this.generateSha256();

        if(!archiveData?.length) {
            logger.error(`Error decompressing file data.`);
            return;
        }

        const encryption = this.details.encryption ?? 'none';
        const encrypted = (this.details.encryption ?? 'none') !== 'none';

        this.format = archiveData.get('byte', 'unsigned');
        this.filesNamed = (archiveData.get('byte', 'unsigned') & 0x01) !== 0;
        const fileCount = archiveData.get('short', 'unsigned');

        const groupIndices: number[] = new Array(fileCount);
        let accumulator = 0;

        for(let i = 0; i < fileCount; i++) {
            const delta = archiveData.get('short', 'unsigned');
            groupIndices[i] = accumulator += delta;
            this.setGroup(groupIndices[i], new Js5Group(groupIndices[i], this, { encryption, encrypted }));
        }

        if(this.filesNamed) {
            for(const groupIndex of groupIndices) {
                this.getGroup(groupIndex).nameHash = archiveData.get('int');
            }
        }

        /* read the crc values */
        for(const groupIndex of groupIndices) {
            this.getGroup(groupIndex).crc32 = archiveData.get('int');
        }

        /* read the version numbers */
        for(const groupIndex of groupIndices) {
            this.getGroup(groupIndex).version = archiveData.get('int');
        }

        /* read the child count */
        const groupChildCounts: Map<number, number> = new Map<number, number>();

        for(const groupIndex of groupIndices) {
            // group file count
            groupChildCounts.set(groupIndex, archiveData.get('short', 'unsigned'));
        }

        /* read the file groupIndices */
        for(const groupIndex of groupIndices) {
            const group = this.getGroup(groupIndex);
            const fileCount = groupChildCounts.get(groupIndex);

            accumulator = 0;
            for(let i = 0; i < fileCount; i++) {
                const delta = archiveData.get('short', 'unsigned');
                const childFileIndex = accumulator += delta;
                group.setFile(childFileIndex, new Js5File(childFileIndex, this, { encryption, encrypted }));
            }
        }

        /* read the child name hashes */
        if(this.filesNamed) {
            for(const groupIndex of groupIndices) {
                const fileGroup = this.getGroup(groupIndex);

                for(const [ , childFile ] of fileGroup.files) {
                    const nameHash = archiveData.get('int');
                    if(childFile) {
                        childFile.nameHash = nameHash;
                    }
                }
            }
        }

        if(decodeGroups) {
            let successes = 0;
            let failures = 0;

            if(this.groups.size) {
                for(const [ , group ] of this.groups) {
                    try {
                        group?.decode();

                        if(group?.data?.length && !group.compressed) {
                            successes++;
                        } else {
                            failures++;
                        }
                    } catch(error) {
                        logger.error(error);
                        failures++;
                    }
                }
            }

            if(successes) {
                logger.info(`${fileCount} file(s) were found, ` +
                    `${successes} decompressed successfully.`);
            } else {
                logger.info(`${fileCount} file(s) were found.`);
            }

            if(failures) {
                logger.error(`${failures} file(s) failed to decompress.`);
            }

            if(AssetFile.xteaMissingKeys) {
                logger.error(`Missing ${AssetFile.xteaMissingKeys} XTEA key(s).`);
            }
        } else {
            logger.info(`${fileCount} file(s) were found.`);
        }
    }

    /**
     * Adds a new or replaces an existing group within the archive.
     * @param fileIndex The index of the group to add or change.
     * @param group The group to add or change.
     */
    public setGroup(fileIndex: number | string, group: Js5Group): void {
        this.groups.set(typeof fileIndex === 'number' ? String(fileIndex) : fileIndex, group);
    }

    /**
     * Fetches a group from this archive by index.
     * @param fileIndex The index of the group to find.
     */
    public getGroup(fileIndex: number | string): Js5Group {
        return this.groups.get(typeof fileIndex === 'number' ? String(fileIndex) : fileIndex);
    }

    /**
     * Fetches a group from this archive by file name.
     * @param fileName The name of the group to find.
     */
    public findGroup(fileName: string): Js5Group {
        return Array.from(this.groups.values()).find(group => group?.name === fileName) ?? null;
    }

    public get format(): number {
        return this._format;
    }

    public set format(value: number) {
        this._format = value;
    }

    public get filesNamed(): boolean {
        return this._filesNamed;
    }

    public set filesNamed(value: boolean) {
        this._filesNamed = value;
    }

}
