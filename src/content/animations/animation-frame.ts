import { AnimationBase } from './animation-base';


export class AnimationFrameList {

    frames: AnimationFrame[];

}

export class AnimationFrame {

    fileIndex: number;
    animationBaseId: number;
    animationBase: AnimationBase;
    translatorIndexes: number[];
    translatorCount: number;
    translatorX: number[];
    translatorY: number[];
    translatorZ: number[];
    visible: boolean;

}
