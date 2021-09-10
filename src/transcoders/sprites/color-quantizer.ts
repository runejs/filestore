import { RGBA } from '../../util';
import { SpriteSheet } from './sprite-sheet';
import { sortPalette } from './sorter';


export const MAX_DEPTH = 8;

const octreeColorOrder = [
    '000', '001', '010', '011', '100', '101', '110', '111'
];


type MinMax = [ number, number ];

class ColorRange {

    public r: MinMax;
    public g: MinMax;
    public b: MinMax;

    public toString(): string {
        return `{ r: [ ${this.r[0]}, ${this.r[1]} ], g: [ ${this.g[0]}, ${this.g[1]} ], b: [ ${this.b[0]}, ${this.b[1]} ] }`;
    }

}


export class ColorNode {

    public readonly quantizer: ColorQuantizer
    public readonly colorRange: ColorRange;
    public readonly level: number;
    public pixelCount: number;
    public paletteIndex: number;
    public children: ColorNode[];
    public colors: RGBA[];

    public constructor(colorRange: ColorRange, level: number, quantizer: ColorQuantizer) {
        this.quantizer = quantizer;
        this.level = level;
        this.colorRange = colorRange;
        this.colors = [];
        this.pixelCount = 0;
        this.paletteIndex = 0;
        this.children = new Array(8);
        if(level < MAX_DEPTH) {
            quantizer.nodeLevels[level].push(this);
        }
    }

    public createChildren(r: MinMax, g: MinMax, b: MinMax): ColorNode[] {
        const nodes: ColorNode[] = new Array(8);

        const [ rMin, rMax ] = r;
        const [ gMin, gMax ] = g;
        const [ bMin, bMax ] = b;
        const rMid = Math.floor((rMin + rMax) / 2);
        const gMid = Math.floor((gMin + gMax) / 2);
        const bMid = Math.floor((bMin + bMax) / 2);

        const colorRanges = [
            [ rMin, rMid, rMax ],
            [ gMin, gMid, gMax ],
            [ bMin, bMid, bMax ],
        ];

        for(let i = 0; i < octreeColorOrder.length; i++) {
            const [ rPos, gPos, bPos ] = octreeColorOrder[i].split('').map(n => Number(n));

            const r: MinMax = [ colorRanges[0][rPos], colorRanges[0][rPos + 1] ];
            const g: MinMax = [ colorRanges[1][gPos], colorRanges[1][gPos + 1] ];
            const b: MinMax = [ colorRanges[2][bPos], colorRanges[2][bPos + 1] ];

            nodes[i] = new ColorNode({
                r, g, b,
            }, this.level + 1, this.quantizer);
        }

        this.children = nodes;
        return nodes;
    }

    public addColor(color: RGBA): void {
        if(!this.colors.find(c => c.equals(color))) {
            this.colors.push(color);
            this.pixelCount = 1;
        } else {
            this.pixelCount++;
        }

        if(this.level === MAX_DEPTH) {
            return;
        }

        const { red, green, blue } = color;
        const { r: [ rMin, rMax ], g: [ gMin, gMax ], b: [ bMin, bMax ] } = this.colorRange;

        const rMid = Math.floor((rMin + rMax) / 2);
        const gMid = Math.floor((gMin + gMax) / 2);
        const bMid = Math.floor((bMin + bMax) / 2);

        let redPos, greenPos, bluePos;

        if(red < rMid) {
            // min - mid red
            redPos = 0;
        } else {
            // mid - max red
            redPos = 1;
        }

        if(green < gMid) {
            // min - mid red
            greenPos = 0;
        } else {
            // mid - max red
            greenPos = 1;
        }

        if(blue < bMid) {
            // min - mid red
            bluePos = 0;
        } else {
            // mid - max red
            bluePos = 1;
        }

        const rgbCode = `${redPos}${greenPos}${bluePos}`;
        const childIndex = octreeColorOrder.indexOf(rgbCode);

        if(!this.children[childIndex]) {
            const colorRanges = [
                [ rMin, rMid, rMax ],
                [ gMin, gMid, gMax ],
                [ bMin, bMid, bMax ],
            ];

            const r: MinMax = [ colorRanges[0][redPos], colorRanges[0][redPos + 1] ];
            const g: MinMax = [ colorRanges[1][greenPos], colorRanges[1][greenPos + 1] ];
            const b: MinMax = [ colorRanges[2][bluePos], colorRanges[2][bluePos + 1] ];
            this.children[childIndex] = new ColorNode({ r, g, b }, this.level + 1, this.quantizer);
        }

        this.children[childIndex].addColor(color);
    }

    public toString(): string {
        return this.colorRange.toString()
    }

}


export class ColorQuantizer {

    public readonly spriteSheet: SpriteSheet;
    public readonly depth: number;
    public root: ColorNode;
    public nodeLevels: ColorNode[][];
    public buckets: ColorNode[][];
    public generatedPalette: RGBA[] | undefined;

    public constructor(spriteSheet: SpriteSheet, depth: number = MAX_DEPTH) {
        this.spriteSheet = spriteSheet;
        this.depth = depth;
        this.nodeLevels = Array.from({ length: MAX_DEPTH }, () => []);
        this.buckets = new Array(MAX_DEPTH);
        this.init();
    }

    public init(): void {
        const r: MinMax = [ 0, 256 ];
        const g: MinMax = [ 0, 256 ];
        const b: MinMax = [ 0, 256 ];
        this.root = new ColorNode({
            r, g, b
        }, 0, this);

        this.root.createChildren(r, g, b);
    }

    public addSpriteSheetColors(): void {
        this.spriteSheet.palette.filter(c => !c.isTransparent).sort().forEach(color => this.addColor(color));
    }

    public addColor(color: RGBA): void {
        this.root.addColor(color);
    }

    public generateColorPalette(histogram: { [key: number]: number }): RGBA[] {
        const palette: RGBA[] = [];

        this.processLevel(this.root, histogram);

        this.buckets[this.depth].forEach(node => node?.colors?.forEach(color => {
            if(color && !palette.find(existingColor => existingColor.equals(color))) {
                palette.push(color);
            }
        }));

        this.generatedPalette = [ new RGBA(0, 0, 0, 0), ...palette ];
        return this.generatedPalette;
    }

    public processLevel(node: ColorNode, histogram: { [key: number]: number }, level: number = 0): void {
        if(!this.buckets[level]) {
            this.buckets[level] = [];
        }

        if(level < MAX_DEPTH) {
            const children = node.children.filter(c => !!c);

            if(children.length !== 0) {
                for(const child of children) {
                    if(child?.colors?.length) {
                        child.colors = sortPalette(child.colors);
                        this.buckets[level].push(child);
                    }

                    this.processLevel(child, histogram, level + 1);
                }
            } else if(node.colors?.length) {
                node.colors = sortPalette(node.colors);
                this.buckets[level].push(node);
            }
        }

        this.buckets[level].sort((node1, node2) => {
            const colors1 = node1.colors;
            const colors2 = node2.colors;

            const averageUsage1 = Math.floor(colors1.map(c => histogram[c.argb] ?? 0)
                .reduce((prev, curr) => prev + curr) / colors1.length);

            const averageUsage2 = Math.floor(colors2.map(c => histogram[c.argb] ?? 0)
                .reduce((prev, curr) => prev + curr) / colors2.length);

            return averageUsage2 - averageUsage1;
        });
    }

}
