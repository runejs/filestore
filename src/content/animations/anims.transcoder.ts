import { ByteBuffer } from '@runejs/common';
import { ArchiveTranscoder } from '../archive-transcoder';
import { FlatFile } from 'flat-file';
import { AnimationBase } from './animation-base';
import { AnimationFrameList, AnimationFrame } from './animation-frame';
import { Archive } from '../../archive';
import { BasesTranscoder } from './bases.transcoder';


export class AnimsTranscoder extends ArchiveTranscoder<AnimationFrameList> {

    private readonly basesTranscoder: BasesTranscoder;

    private scratchTranslatorIndexes: number[] = new Array(500);
    private scratchTranslatorX: number[] = new Array(500);
    private scratchTranslatorY: number[] = new Array(500);
    private scratchTranslatorZ: number[] = new Array(500);

    constructor(archive: Archive, basesTranscoder: BasesTranscoder) {
        super(archive);
        this.basesTranscoder = basesTranscoder;
    }

    override decodeGroup(groupKey: number): AnimationFrameList | null;
    override decodeGroup(groupName: string): AnimationFrameList | null;
    override decodeGroup(groupKeyOrName: string | number): AnimationFrameList | null {
        const group = this.findGroup(groupKeyOrName);
        if (!group) {
            return null;
        }

        const { numericKey: groupKey, files } = group;

        if (this.decodedGroups?.has(groupKey)) {
            return this.decodedGroups.get(groupKey);
        }

        const loadedBases: AnimationBase[] = [];
        const frames: AnimationFrame[] = [];

        for (const [ , file ] of files) {
            const { data: fileData } = file;
            const animationBaseId = fileData[1] & 0xff | fileData[0] << 8 & 0xff00;
            let animationBase: AnimationBase =
                loadedBases.find(base => base.id === animationBaseId) || null;

            if (animationBase === null) {
                animationBase = this.basesTranscoder.decodeGroup(animationBaseId);
                loadedBases.push(animationBase);
            }

            frames.push(this.decodeFile(file, animationBase));
        }

        const animationFrameList = new AnimationFrameList();
        animationFrameList.frames = frames;

        this.decodedGroups.set(groupKey, animationFrameList);

        return animationFrameList;
    }

    decodeFile(file: FlatFile, base: AnimationBase): AnimationFrame {
        const { numericKey: fileIndex, data: fileData } = file;

        const opcodeReader = fileData.clone();
        const animReader = fileData.clone();
        opcodeReader.readerIndex = 2;

        const length = opcodeReader.get('byte', 'u');

        animReader.readerIndex = opcodeReader.readerIndex + length;

        const animationFrame = new AnimationFrame();
        animationFrame.fileIndex = fileIndex;
        animationFrame.animationBaseId = base.id;
        animationFrame.animationBase = base;

        let index = 0;
        let lastIndex = -1;

        for (let i = 0; i < length; i++) {
            const opcode = opcodeReader.get('byte', 'u');

            if (opcode <= 0) {
                continue;
            }

            if (animationFrame.animationBase.types[i] !== 0) {
                for (let j = i - 1; j > lastIndex; j--) {
                    if (animationFrame.animationBase.types[j] === 0) {
                        this.scratchTranslatorIndexes[index] = j;
                        this.scratchTranslatorX[index] = 0;
                        this.scratchTranslatorY[index] = 0;
                        this.scratchTranslatorZ[index] = 0;
                        index++;
                        break;
                    }
                }
            }

            this.scratchTranslatorIndexes[index] = i;
            let defaultTranslation = 0;

            if (animationFrame.animationBase.types[i] === 3) {
                defaultTranslation = 128;
            }

            if ((opcode & 0x1) !== 0) {
                this.scratchTranslatorX[index] = animReader.get('smart_short', 'u');
            } else {
                this.scratchTranslatorX[index] = defaultTranslation;
            }
            
            if ((opcode & 0x2) !== 0) {
                this.scratchTranslatorY[index] = animReader.get('smart_short', 'u');
            } else {
                this.scratchTranslatorY[index] = defaultTranslation;
            }

            if ((opcode & 0x4) !== 0) {
                this.scratchTranslatorZ[index] = animReader.get('smart_short', 'u');
            } else {
                this.scratchTranslatorZ[index] = defaultTranslation;
            }

            lastIndex = i;
            index++;

            if (animationFrame.animationBase.types[i] === 5) {
                animationFrame.visible = true;
            }
        }

        if (animReader.readerIndex !== fileData.length) {
            throw new Error(`Animation frame file corrupted.`);
        }

        animationFrame.translatorCount = index;
        animationFrame.translatorIndexes = new Array(index);
        animationFrame.translatorX = new Array(index);
        animationFrame.translatorY = new Array(index);
        animationFrame.translatorZ = new Array(index);

        for (let i = 0; i < index; i++) {
            animationFrame.translatorIndexes[i] = this.scratchTranslatorIndexes[i];
            animationFrame.translatorX[i] = this.scratchTranslatorX[i];
            animationFrame.translatorY[i] = this.scratchTranslatorY[i];
            animationFrame.translatorZ[i] = this.scratchTranslatorZ[i];
        }

        return animationFrame;
    }

    override encodeGroup(groupKey: number): ByteBuffer | null;
    override encodeGroup(groupName: string): ByteBuffer | null;
    override encodeGroup(groupKeyOrName: string | number): ByteBuffer | null {
        throw new Error('Method not implemented.');
    }

}
