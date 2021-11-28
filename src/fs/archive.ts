import { logger } from '@runejs/common';
import { ByteBuffer } from '@runejs/common/buffer';
import { ArchiveProperties, ArchiveIndex, FileProperties, Group, BinaryFile, readArchiveIndexFile } from './index';
import { join } from 'path';


export class Archive extends BinaryFile<ArchiveIndex> {

    public readonly archiveProperties: ArchiveProperties;
    public readonly children: Map<string, Archive | Group | BinaryFile>;

    public constructor(index: string | number, properties?: Partial<FileProperties<ArchiveIndex>>) {
        super(index, properties);

        if(!this.store) {
            throw new Error(`Store not provided when initializing archive ${index}. ` +
                `Please include the 'store' property to the archive properties.`)
        }

        this.archiveProperties = this.store.archiveConfig[this.fileKey];
        this.children = new Map<string, Archive | Group | BinaryFile>();
    }

    public js5Encode(compress: boolean = true): ByteBuffer {
        if(!this.empty && (this.compressed || this.compression === 'none')) {
            return this.data;
        }

        if(this.numericKey === 255) {
            return this.store.js5Encode();
        }

        if(!this.children.size) {
            this.read(true);
        }

        const groups = this.children;
        const groupCount = groups.size;

        // @TODO add sizes of all files instead of using a set amount here
        const buffer = new ByteBuffer(1000 * 1000);

        // Write index file header
        buffer.put(this.archiveProperties.format ?? 5); // '5' for 'JS5' by default
        buffer.put(this.archiveProperties.saveFileNames ? 1 : 0);
        buffer.put(groupCount, 'short');

        // Write file indexes
        let writtenFileIndex = 0;
        for(const [ , group ] of groups) {
            const val = group.numericKey;
            buffer.put(val - writtenFileIndex, 'short');
            writtenFileIndex = val;
        }

        // Write name hashes (if applicable)
        if(this.archiveProperties.saveFileNames) {
            for(const [ , file ] of groups) {
                buffer.put(file.nameHash ?? 0, 'int');
            }
        }

        // Write file crc values
        for(const [ , file ] of groups) {
            buffer.put(file.crc32 ?? 0, 'int');
        }

        // Write file version numbers
        for(const [ , file ] of groups) {
            buffer.put(0, 'int');
        }

        // Write file group child counts
        for(const [ , group ] of groups) {
            buffer.put((group instanceof Group) ? (group.files.size ?? 1) : 1, 'short');
        }

        // Write group file indices
        for(const [ , group ] of groups) {
            if(group instanceof Group && group.files.size > 1) {
                writtenFileIndex = 0;

                for(const [ , file ] of group.files) {
                    const i = file.numericKey;
                    buffer.put(i - writtenFileIndex, 'short');
                    writtenFileIndex = i;
                }
            } else {
                buffer.put(0, 'short');
            }
        }

        // Write group file name hashes (if applicable)
        if(this.archiveProperties.saveFileNames) {
            for(const [ , group ] of groups) {
                if(group instanceof Group && group.files.size > 1) {
                    for(const [ , file ] of group.files) {
                        buffer.put(file.nameHash ?? 0, 'int');
                    }
                } else {
                    buffer.put(0, 'int');
                }
            }
        }

        const indexData = buffer.flipWriter();
        const indexDigest = this.sha256;

        if(indexData.length) {
            this.setData(indexData, false);
            this.generateSha256();

            if(indexDigest !== this.sha256) {
                // logger.warn(`Archive ${this.name} digest has changed:`, `Orig: ${indexDigest}`, `New:  ${this.sha256}`);
                this.fileIndex.sha256 = this.sha256;
            }

            if(compress) {
                this.compress();
            }

            return this._data;
        }

        return null;
    }

    public override compress(): ByteBuffer | null {
        if(this.empty) {
            this.js5Encode(true);
        }

        return super.compress();
    }

    public override read(compress: boolean = false): void {
        if(this.children.size > 0) {
            logger.warn(`Archive ${this.name} has already been read, please use reload() to re-read the archive's contents.`);
            return;
        }

        this.fileIndex = readArchiveIndexFile(this.path);
    }

    public reload(compress: boolean = false): void {
        this.children.clear();
        this.read(compress);
    }

    public has(childIndex: string | number): boolean {
        return this.children.has(String(childIndex));
    }

    public get(childIndex: string | number): Archive | Group | BinaryFile | null {
        return this.children.get(String(childIndex)) ?? null;
    }

    public set(archiveIndex: string | number, archive: Archive): void;
    public set(groupIndex: string | number, group: Group): void;
    public set(fileIndex: string | number, file: BinaryFile): void;
    public set(childIndex: string | number, child: Archive | Group | BinaryFile): void;
    public set(childIndex: string | number, child: Archive | Group | BinaryFile): void {
        this.children.set(String(childIndex), child);
    }

    public find(fileName: string): Archive | Group | BinaryFile | null {
        const children = Array.from(this.children.values());
        return children.find(child => child?.name === fileName) ?? null;
    }

    public override get path(): string {
        if(!this.store?.path) {
            throw new Error(`Error generating archive path; Store path not provided for archive ${this.fileKey}.`);
        }
        if(!this.name) {
            throw new Error(`Error generating archive path; Name not provided for archive ${this.fileKey}.`);
        }

        return join(this.store.path, 'archives', this.name);
    }

}
