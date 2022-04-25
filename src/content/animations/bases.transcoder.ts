import { ByteBuffer } from '@runejs/common';
import { ArchiveTranscoder } from '../archive-transcoder';
import { AnimationBase } from './animation-base';


export class BasesTranscoder extends ArchiveTranscoder<AnimationBase> {
    
    override decodeGroup(groupKey: number): AnimationBase | null;
    override decodeGroup(groupName: string): AnimationBase | null;
    override decodeGroup(groupKeyOrName: string | number): AnimationBase | null {
        const group = this.findGroup(groupKeyOrName);
        if (!group) {
            return null;
        }

        const { numericKey: groupKey, data: fileData } = group;

        if (this.decodedGroups?.has(groupKey)) {
            return this.decodedGroups.get(groupKey);
        }

        const animationBase = new AnimationBase();
        animationBase.id = groupKey;
        const length = animationBase.length = fileData.get('byte', 'u');
        const types = animationBase.types = new Array(length);
        const frameMaps = animationBase.frameMaps = new Array(length);

        for (let i = 0; i < length; i++) {
            types[i] = fileData.get('byte', 'u');
        }

        for (let i = 0; length > i; i++) {
            const frameMapCount = fileData.get('byte', 'u');
            if (frameMapCount > 0) {
                console.log(frameMapCount);
            }
            frameMaps[i] = new Array(frameMapCount);
        }

        for (let i = 0; i < length; i++) {
            for (let j = 0; frameMaps[i].length > j; j++) {
                frameMaps[i][j] = fileData.get('byte', 'u');
            }
        }

        this.decodedGroups.set(groupKey, animationBase);
        return animationBase;
    }

    override encodeGroup(groupKey: number): ByteBuffer | null;
    override encodeGroup(groupName: string): ByteBuffer | null;
    override encodeGroup(groupKeyOrName: string | number): ByteBuffer | null {
        throw new Error('Method not implemented.');
    }

}
