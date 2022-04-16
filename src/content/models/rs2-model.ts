import { VertexNormal } from './vertex-normal';
import { ModelColor } from './model-color';


export class Rs2Model {

    id: number;
    vertexCount: number;
    faceCount: number;
    texturedFaceCount: number;
    verticesX: number[];
    verticesY: number[];
    verticesZ: number[];
    faceIndicesA: Uint16Array;
    faceIndicesB: Uint16Array;
    faceIndicesC: Uint16Array;
    texturedFaceTypes: Uint8Array;
    texturedFaceIndicesA: Uint16Array;
    texturedFaceIndicesB: Uint16Array;
    texturedFaceIndicesC: Uint16Array;
    vertexSkins: number[];
    faceTypes: Uint32Array;
    texturedFaceTypeIndices: Int8Array;
    faceTextures: Int8Array;
    facePriorities: Uint8Array;
    facePriority: number;
    faceAlphas: Uint8Array;
    faceSkins: number[];
    faceColors: Uint32Array;
    faceTextureU: number[][];
    faceTextureV: number[][];
    faceColorsX: Uint32Array;
    faceColorsY: Uint32Array;
    faceColorsZ: Uint32Array;
    vertexNormals: VertexNormal[];
    vertexNormalOffsets: VertexNormal[];
    anInt3193: number;

    constructor(id?: number) {
        if (id !== undefined && id !== null) {
            this.id = id;
        }
        this.texturedFaceCount = 0;
        this.vertexCount = 0;
        this.facePriority = 0;
    }

    computeTextureUVs() {
        if (this.faceTextureU) {
            return;
        }
        this.faceTextureU = new Array<Array<number>>(this.faceCount);
        this.faceTextureV = new Array<Array<number>>(this.faceCount);

        for (let i = 0; i < this.faceCount; i++) {
            let texturedFaceTypeIndex;
            if (this.texturedFaceTypeIndices == null) {
                texturedFaceTypeIndex = -1;
            } else {
                texturedFaceTypeIndex = this.texturedFaceTypeIndices[i];
            }

            let textureId;
            if (this.faceTextures == null) {
                textureId = -1;
            } else {
                textureId = this.faceTextures[i] & 0xFFFF;
            }

            if (textureId !== -1) {
                const u = new Array<number>(3);
                const v = new Array<number>(3);

                if (texturedFaceTypeIndex === -1) {
                    u[0] = 0.0;
                    v[0] = 1.0;

                    u[1] = 1.0;
                    v[1] = 1.0;

                    u[2] = 0.0;
                    v[2] = 0.0;
                } else {
                    texturedFaceTypeIndex &= 0xFF;

                    let texturedFaceType = 0;
                    if (this.texturedFaceTypes != null) {
                        texturedFaceType = this.texturedFaceTypes[texturedFaceTypeIndex];
                    }

                    if (texturedFaceType === 0) {
                        const faceIndexA = this.faceIndicesA[i];
                        const faceIndexB = this.faceIndicesB[i];
                        const faceIndexC = this.faceIndicesC[i];

                        const texturedFaceIndexA = this.texturedFaceIndicesA[texturedFaceTypeIndex];
                        const texturedFaceIndexB = this.texturedFaceIndicesB[texturedFaceTypeIndex];
                        const texturedFaceIndexC = this.texturedFaceIndicesC[texturedFaceTypeIndex];

                        const vertexX = this.verticesX[texturedFaceIndexA];
                        const vertexY = this.verticesY[texturedFaceIndexA];
                        const vertexZ = this.verticesZ[texturedFaceIndexA];

                        const f_882_ = this.verticesX[texturedFaceIndexB] - vertexX;
                        const f_883_ = this.verticesY[texturedFaceIndexB] - vertexY;
                        const f_884_ = this.verticesZ[texturedFaceIndexB] - vertexZ;
                        const f_885_ = this.verticesX[texturedFaceIndexC] - vertexX;
                        const f_886_ = this.verticesY[texturedFaceIndexC] - vertexY;
                        const f_887_ = this.verticesZ[texturedFaceIndexC] - vertexZ;
                        const f_888_ = this.verticesX[faceIndexA] - vertexX;
                        const f_889_ = this.verticesY[faceIndexA] - vertexY;
                        const f_890_ = this.verticesZ[faceIndexA] - vertexZ;
                        const f_891_ = this.verticesX[faceIndexB] - vertexX;
                        const f_892_ = this.verticesY[faceIndexB] - vertexY;
                        const f_893_ = this.verticesZ[faceIndexB] - vertexZ;
                        const f_894_ = this.verticesX[faceIndexC] - vertexX;
                        const f_895_ = this.verticesY[faceIndexC] - vertexY;
                        const f_896_ = this.verticesZ[faceIndexC] - vertexZ;

                        const f_897_ = f_883_ * f_887_ - f_884_ * f_886_;
                        const f_898_ = f_884_ * f_885_ - f_882_ * f_887_;
                        const f_899_ = f_882_ * f_886_ - f_883_ * f_885_;
                        let f_900_ = f_886_ * f_899_ - f_887_ * f_898_;
                        let f_901_ = f_887_ * f_897_ - f_885_ * f_899_;
                        let f_902_ = f_885_ * f_898_ - f_886_ * f_897_;
                        let f_903_ = 1.0 / (f_900_ * f_882_ + f_901_ * f_883_ + f_902_ * f_884_);

                        u[0] = (f_900_ * f_888_ + f_901_ * f_889_ + f_902_ * f_890_) * f_903_;
                        u[1] = (f_900_ * f_891_ + f_901_ * f_892_ + f_902_ * f_893_) * f_903_;
                        u[2] = (f_900_ * f_894_ + f_901_ * f_895_ + f_902_ * f_896_) * f_903_;

                        f_900_ = f_883_ * f_899_ - f_884_ * f_898_;
                        f_901_ = f_884_ * f_897_ - f_882_ * f_899_;
                        f_902_ = f_882_ * f_898_ - f_883_ * f_897_;
                        f_903_ = 1.0 / (f_900_ * f_885_ + f_901_ * f_886_ + f_902_ * f_887_);

                        v[0] = (f_900_ * f_888_ + f_901_ * f_889_ + f_902_ * f_890_) * f_903_;
                        v[1] = (f_900_ * f_891_ + f_901_ * f_892_ + f_902_ * f_893_) * f_903_;
                        v[2] = (f_900_ * f_894_ + f_901_ * f_895_ + f_902_ * f_896_) * f_903_;
                    }
                }

                this.faceTextureU[i] = u;
                this.faceTextureV[i] = v;
            }
        }
    }

    applyLighting(ambient: number, contrast: number, arg2: number,
                         arg3: number, arg4: number, applyShading: boolean): void {
        const i = ~~Math.sqrt(arg2 * arg2 + arg3 * arg3 + arg4 * arg4);
        const i_50_ = contrast * i >> 8;
        if (this.faceColorsX === null) {
            this.faceColorsX = new Uint32Array(this.faceCount);
            this.faceColorsY = new Uint32Array(this.faceCount);
            this.faceColorsZ = new Uint32Array(this.faceCount);
        }
        if (this.vertexNormals === null) {
            const initializeVertexNormals = [ ...Array(this.vertexCount) ];
            this.vertexNormals = initializeVertexNormals.map(() => new VertexNormal());
        }
        for (let i_52_ = 0; i_52_ < this.faceCount; i_52_++) {
            const faceA = this.faceIndicesA[i_52_];
            const faceB = this.faceIndicesB[i_52_];
            const faceC = this.faceIndicesC[i_52_];
            const i_56_ = this.verticesX[faceB] - this.verticesX[faceA];
            const i_57_ = this.verticesY[faceB] - this.verticesY[faceA];
            const i_58_ = this.verticesZ[faceB] - this.verticesZ[faceA];
            const i_59_ = this.verticesX[faceC] - this.verticesX[faceA];
            const i_60_ = this.verticesY[faceC] - this.verticesY[faceA];
            const i_61_ = this.verticesZ[faceC] - this.verticesZ[faceA];
            let i_62_ = i_57_ * i_61_ - i_60_ * i_58_;
            let i_63_ = i_58_ * i_59_ - i_61_ * i_56_;
            let i_64_;
            for (i_64_ = i_56_ * i_60_ - i_59_ * i_57_;
                i_62_ > 8192 || i_63_ > 8192 || i_64_ > 8192 || i_62_ < -8192 || i_63_ < -8192 || i_64_ < -8192;
                i_64_ >>= 1) {
                i_62_ >>= 1;
                i_63_ >>= 1;
            }
            let i_65_ = ~~Math.sqrt(i_62_ * i_62_ + i_63_ * i_63_ + i_64_ * i_64_);
            if (i_65_ <= 0) {
                i_65_ = 1;
            }
            i_62_ = ~~(i_62_ * 256 / i_65_);
            i_63_ = ~~(i_63_ * 256 / i_65_);
            i_64_ = ~~(i_64_ * 256 / i_65_);
            if (this.faceTypes == null || (this.faceTypes[i_52_] & 0x1) == 0) {
                let class46 = this.vertexNormals[faceA];
                class46.x += i_62_;
                class46.y += i_63_;
                class46.z += i_64_;
                class46.magnitude++;
                class46 = this.vertexNormals[faceB];
                class46.x += i_62_;
                class46.y += i_63_;
                class46.z += i_64_;
                class46.magnitude++;
                class46 = this.vertexNormals[faceC];
                class46.x += i_62_;
                class46.y += i_63_;
                class46.z += i_64_;
                class46.magnitude++;
            } else {
                const i_66_ = ambient + (arg2 * i_62_ + arg3 * i_63_ + arg4 * i_64_) / (i_50_ + i_50_ / 2);
                this.faceColorsX[i_52_] = ModelColor.method816(this.faceColors[i_52_], i_66_, this.faceTypes[i_52_]);
            }
        }
        if (applyShading) {
            this.applyShading(ambient, i_50_, arg2, arg3, arg4);
        } else {
            this.vertexNormalOffsets = new Array<VertexNormal>(this.vertexCount);
            for (let i_67_ = 0; i_67_ < this.vertexCount; i_67_++) {
                const normal = this.vertexNormals[i_67_];
                const normalOffset = this.vertexNormalOffsets[i_67_] = new VertexNormal();
                normalOffset.x = normal.x;
                normalOffset.y = normal.y;
                normalOffset.z = normal.z;
                normalOffset.magnitude = normal.magnitude;
            }
            this.anInt3193 = (ambient << 16) + (i_50_ & 0xffff);
        }
    }

    applyShading(arg0: number, arg1: number, arg2: number,
                        arg3: number, arg4: number): void {
        for (let i = 0; i < this.faceCount; i++) {
            const faceA = this.faceIndicesA[i];
            const faceB = this.faceIndicesB[i];
            const faceC = this.faceIndicesC[i];
            if (this.faceTypes == null) {
                const faceColor = this.faceColors[i];
                let normal = this.vertexNormals[faceA];
                let i_76_ = ~~(arg0 + (arg2 * normal.x + arg3 *
                    normal.y + arg4 * normal.z) / (arg1 * normal.magnitude));
                this.faceColorsX[i] = ModelColor.method816(faceColor, i_76_, 0);
                normal = this.vertexNormals[faceB];
                i_76_ = ~~(arg0 + (arg2 * normal.x + arg3 *
                    normal.y + arg4 * normal.z) / (arg1 * normal.magnitude));
                this.faceColorsY[i] = ModelColor.method816(faceColor, i_76_, 0);
                normal = this.vertexNormals[faceC];
                i_76_ = ~~(arg0 + (arg2 * normal.x + arg3 *
                    normal.y + arg4 * normal.z) / (arg1 * normal.magnitude));
                this.faceColorsZ[i] = ModelColor.method816(faceColor, i_76_, 0);
            } else if ((this.faceTypes[i] & 0x1) == 0) {
                const faceColor = this.faceColors[i];
                const faceType = this.faceTypes[i];
                let normal = this.vertexNormals[faceA];
                let i_79_ = ~~(arg0 + (arg2 * normal.x + arg3 *
                    normal.y + arg4 * normal.z) / (arg1 * normal.magnitude));
                this.faceColorsX[i] = ModelColor.method816(faceColor, i_79_, faceType);
                normal = this.vertexNormals[faceB];
                i_79_ = ~~(arg0 + (arg2 * normal.x + arg3 *
                    normal.y + arg4 * normal.z) / (arg1 * normal.magnitude));
                this.faceColorsY[i] = ModelColor.method816(faceColor, i_79_, faceType);
                normal = this.vertexNormals[faceC];
                i_79_ = ~~(arg0 + (arg2 * normal.x + arg3 *
                    normal.y + arg4 * normal.z) / (arg1 * normal.magnitude));
                this.faceColorsZ[i] = ModelColor.method816(faceColor, i_79_, faceType);
            }
        }
    }

}
