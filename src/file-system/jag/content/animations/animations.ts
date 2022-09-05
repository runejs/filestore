import { JagFileStore } from '../../jag-file-store';
import { Buffer } from 'buffer';
import { ByteBuffer, logger } from '@runejs/common';
import { JagCache } from '../../jag-cache';


export interface AnimationFile {
    key: number;
    version: number;
    checksum: number;
    data?: Buffer;
}


export class Animations {

    readonly jagStore: JagFileStore;
    readonly animations: Map<number, AnimationFile>;
    readonly animationsIndex: JagCache;

    versionListDecoded: boolean = false;

    constructor(jagStore: JagFileStore) {
        this.jagStore = jagStore;
        this.animations = new Map<number, any>();
        this.animationsIndex = this.jagStore.getCache('animations');
    }

    decodeVersionList(): void {
        const archiveIndex = this.jagStore.getCache('archives');
        if (!archiveIndex) {
            throw new Error(`Archive Index is not loaded!`);
        }

        const versionListArchive = archiveIndex.getArchive('versionlist.jag');
        if (!versionListArchive) {
            throw new Error(`versionlist.jag archive is not loaded!`);
        }

        const animVersionList = versionListArchive.getFile('anim_version');
        const animChecksumList = versionListArchive.getFile('anim_crc');
        const animIndexList = versionListArchive.getFile('anim_index');

        if (!animVersionList?.data?.buffer?.length) {
            throw new Error(`anim_version file is not loaded!`);
        }
        if (!animChecksumList?.data?.buffer?.length) {
            throw new Error(`anim_crc file is not loaded!`);
        }
        if (!animIndexList?.data?.buffer?.length) {
            throw new Error(`anim_index file is not loaded!`);
        }

        this.animations.clear();

        const versionData = new ByteBuffer(animVersionList.data.buffer);
        const checksumData = new ByteBuffer(animVersionList.data.buffer);
        const indexData = new ByteBuffer(animVersionList.data.buffer);
        const animCount = versionData.length / 2;

        for (let i = 0; i < animCount; i++) {
            const version = versionData.get('short', 'unsigned');
            const checksum = checksumData.get('int');
            const key = indexData.get('short', 'unsigned');

            this.animations.set(key, {
                key, version, checksum
            });
        }

        this.versionListDecoded = true;
    }

    decodeAll(): void {
        if (!this.versionListDecoded) {
            this.decodeVersionList();
        }

        for (const [ animKey, ] of this.animationsIndex.files) {
            this.decode(animKey);
        }
    }

    decode(animKey: number): AnimationFile | null {
        const animFile = this.animationsIndex.getFile(animKey);

        if (!animFile?.data?.buffer?.length) {
            logger.warn(`Animation ${animKey} is empty or missing.`);
            return null;
        }

        const animData = new ByteBuffer(animFile.data.buffer);

        //@todo stopped here - 12/08/22 - Kiko
        return null;
    }

}
