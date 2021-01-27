import { Filestore } from '../filestore';
import { FileIndex } from '../file-index';
import {ByteBuffer, logger} from "@runejs/core";


export class RsModel {

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
    faceMappings: Uint8Array;
    texturedFaceIndicesA: Uint16Array;
    texturedFaceIndicesB: Uint16Array;
    texturedFaceIndicesC: Uint16Array;
    vertexSkins: number[];
    faceTypes: Uint8Array;
    facePriorities: Uint8Array;
    facePriority: number;
    faceAlphas: Uint8Array;
    faceSkins: number[];
    faceColors: Uint16Array;

    constructor() {
        this.texturedFaceCount = 0;
        this.vertexCount = 0;
        this.facePriority = 0;
    }

}


/**
 * Controls model file storage.
 */
export class ModelStore {

    private readonly modelFileIndex: FileIndex;

    public constructor(private fileStore: Filestore) {
        this.modelFileIndex = this.fileStore.getIndex('models');
    }

    public getModel(id: number): RsModel | null {
        const file = this.modelFileIndex.getFile(id) || null;
        if(!file) {
            logger.warn(`Model file ${id} not found`);
            return null;
        }
        const rsModel = new RsModel();
        const buffer = file.content;
        buffer.readerIndex = 0;
        let vertexDirectionOffsetBuffer = new ByteBuffer(buffer);
        let xDataOffsetBuffer = new ByteBuffer(buffer);
        let yDataOffsetBuffer = new ByteBuffer(buffer);
        let zDataOffsetBuffer = new ByteBuffer(buffer);
        let vertexSkinOffsetBuffer = new ByteBuffer(buffer);
        vertexDirectionOffsetBuffer.readerIndex = buffer.length - 18;
        rsModel.vertexCount = vertexDirectionOffsetBuffer.get('SHORT', 'UNSIGNED');
        rsModel.faceCount = vertexDirectionOffsetBuffer.get('SHORT', 'UNSIGNED');
        rsModel.texturedFaceCount = vertexDirectionOffsetBuffer.get('BYTE', 'UNSIGNED');
        const hasFaceTypes = vertexDirectionOffsetBuffer.get('BYTE', 'UNSIGNED');
        const modelPriority = vertexDirectionOffsetBuffer.get('BYTE', 'UNSIGNED');
        const hasFaceAlphas = vertexDirectionOffsetBuffer.get('BYTE', 'UNSIGNED');
        const hasFaceSkins = vertexDirectionOffsetBuffer.get('BYTE', 'UNSIGNED');
        const hasVertexSkins = vertexDirectionOffsetBuffer.get('BYTE', 'UNSIGNED');
        const verticesXSubOffset = vertexDirectionOffsetBuffer.get('SHORT', 'UNSIGNED');
        const verticesYSubOffset = vertexDirectionOffsetBuffer.get('SHORT', 'UNSIGNED');
        const verticesZSubOffset = vertexDirectionOffsetBuffer.get('SHORT', 'UNSIGNED');
        const faceIndicesSubOffset = vertexDirectionOffsetBuffer.get('SHORT', 'UNSIGNED');
        let offset = 0;
        const vertexFlagsOffset = offset;
        offset += rsModel.vertexCount;
        const facesCompressTypeOffset = offset;
        offset += rsModel.faceCount;
        const facePrioritiesOffset = offset;
        if (modelPriority == 255) {
            offset += rsModel.faceCount;
        }
        const faceSkinsOffset = offset;
        if (hasFaceSkins == 1) {
            offset += rsModel.faceCount;
        }
        const faceTypesOffset = offset;
        if (hasFaceTypes == 1) {
            offset += rsModel.faceCount;
        }
        const vertexSkinsOffset = offset;
        if (hasVertexSkins == 1) {
            offset += rsModel.vertexCount;
        }
        const faceAlphasOffset = offset;
        if (hasFaceAlphas == 1) {
            offset += rsModel.faceCount;
        }
        const faceIndicesOffset = offset;
        offset += faceIndicesSubOffset;
        const faceColorsOffset = offset;
        offset += rsModel.faceCount * 2;
        const faceMappingsOffset = offset;
        offset += rsModel.texturedFaceCount * 6;
        const verticesXOffset = offset;
        offset += verticesXSubOffset;
        const verticesYOffset = offset;
        offset += verticesYSubOffset;
        const verticesZOffset = offset;
        offset += verticesZSubOffset;
        rsModel.verticesX = new Array(rsModel.vertexCount);
        rsModel.verticesY = new Array(rsModel.vertexCount);
        rsModel.verticesZ = new Array(rsModel.vertexCount);
        rsModel.faceIndicesA = new Uint16Array(rsModel.faceCount);
        rsModel.faceIndicesB = new Uint16Array(rsModel.faceCount);
        rsModel.faceIndicesC = new Uint16Array(rsModel.faceCount);
        if (rsModel.texturedFaceCount > 0) {
            rsModel.faceMappings = new Uint8Array(rsModel.texturedFaceCount);
            rsModel.texturedFaceIndicesA = new Uint16Array(rsModel.texturedFaceCount);
            rsModel.texturedFaceIndicesB = new Uint16Array(rsModel.texturedFaceCount);
            rsModel.texturedFaceIndicesC = new Uint16Array(rsModel.texturedFaceCount);
        }
        if (hasVertexSkins == 1) {
            rsModel.vertexSkins = new Array(rsModel.texturedFaceCount);
        }
        if (hasFaceTypes == 1) {
            rsModel.faceTypes = new Uint8Array(rsModel.faceCount);
        }
        if (modelPriority == 255) {
            rsModel.facePriorities = new Uint8Array(rsModel.faceCount);
        } else {
            rsModel.facePriority = modelPriority & 128;
        }
        if (hasFaceAlphas == 1) {
            rsModel.faceAlphas = new Uint8Array(rsModel.faceCount);
        }
        if (hasFaceSkins == 1) {
            rsModel.faceSkins = new Array(rsModel.faceCount);
        }
        rsModel.faceColors = new Uint16Array(rsModel.faceCount);
        vertexDirectionOffsetBuffer.readerIndex = vertexFlagsOffset;
        xDataOffsetBuffer.readerIndex = verticesXOffset;
        yDataOffsetBuffer.readerIndex = verticesYOffset;
        zDataOffsetBuffer.readerIndex = verticesZOffset;
        vertexSkinOffsetBuffer.readerIndex = vertexSkinsOffset;
        let baseOffsetX = 0;
        let baseOffsetY = 0;
        let baseOffsetZ = 0;
        for(let i = 0; i < rsModel.faceCount; i++) {
            const mask = vertexDirectionOffsetBuffer.get('BYTE', 'UNSIGNED');
            let xOffset = 0;
            if ((mask & 0x1) != 0) {
                xOffset = xDataOffsetBuffer.get('SMART', 'UNSIGNED');
            }
            let yOffset = 0;
            if ((mask & 0x2) != 0) {
                yOffset = yDataOffsetBuffer.get('SMART', 'UNSIGNED');
            }
            let zOffset = 0;
            if ((mask & 0x4) != 0) {
                zOffset = zDataOffsetBuffer.get('SMART', 'UNSIGNED');
            }
            rsModel.verticesX[i] = baseOffsetX + xOffset;
            rsModel.verticesY[i] = baseOffsetY + yOffset;
            rsModel.verticesZ[i] = baseOffsetZ + zOffset;
            baseOffsetX = rsModel.verticesX[i];
            baseOffsetY = rsModel.verticesY[i];
            baseOffsetZ = rsModel.verticesZ[i];
            if (hasVertexSkins == 1) {
                rsModel.vertexSkins[i] = vertexSkinOffsetBuffer.get('BYTE', 'UNSIGNED');
            }
        }
        vertexDirectionOffsetBuffer.readerIndex = faceColorsOffset;
        xDataOffsetBuffer.readerIndex = faceTypesOffset;
        yDataOffsetBuffer.readerIndex = facePrioritiesOffset;
        zDataOffsetBuffer.readerIndex = faceAlphasOffset;
        vertexSkinOffsetBuffer.readerIndex = faceSkinsOffset;
        for(let i = 0; i < rsModel.faceCount; i++) {
            rsModel.faceColors[i] = vertexDirectionOffsetBuffer.get('SHORT', 'UNSIGNED');
            if (hasFaceTypes == 1) {
                rsModel.faceTypes[i] = xDataOffsetBuffer.get('BYTE', 'UNSIGNED');
            }
            if (modelPriority == 255) {
                rsModel.facePriorities[i] = yDataOffsetBuffer.get('BYTE', 'UNSIGNED');
            }
            if (hasFaceAlphas == 1) {
                rsModel.faceAlphas[i] = zDataOffsetBuffer.get('BYTE', 'UNSIGNED');
            }
            if (hasFaceSkins == 1) {
                rsModel.faceSkins[i] = vertexSkinOffsetBuffer.get('BYTE', 'UNSIGNED');
            }
        }
        vertexDirectionOffsetBuffer.readerIndex = faceIndicesOffset;
        xDataOffsetBuffer.readerIndex = facesCompressTypeOffset;
        let lastA = 0;
        let lastB = 0;
        let lastC = 0;
        let accumulator = 0;
        for(let i = 0; i < rsModel.faceCount; i++) {
            const type = xDataOffsetBuffer.get('BYTE', 'UNSIGNED');
            switch(type) {
                case 1:
                    lastA = vertexDirectionOffsetBuffer.get('SMART', 'UNSIGNED') + accumulator;
                    accumulator = lastA;
                    lastB = vertexDirectionOffsetBuffer.get('SMART', 'UNSIGNED') + accumulator;
                    accumulator = lastB;
                    lastC = vertexDirectionOffsetBuffer.get('SMART', 'UNSIGNED') + accumulator;
                    accumulator = lastC;
                    rsModel.faceIndicesA[i] = lastA;
                    rsModel.faceIndicesB[i] = lastB;
                    rsModel.faceIndicesC[i] = lastC;
                    break;
                case 2:
                    lastB = lastC;
                    lastC = vertexDirectionOffsetBuffer.get('SMART', 'UNSIGNED') + accumulator;
                    accumulator = lastC;
                    rsModel.faceIndicesA[i] = lastA;
                    rsModel.faceIndicesB[i] = lastB;
                    rsModel.faceIndicesC[i] = lastC;
                    break;
                case 3:
                    lastA = lastC;
                    lastC = vertexDirectionOffsetBuffer.get('SMART', 'UNSIGNED') + accumulator;
                    accumulator = lastC;
                    rsModel.faceIndicesA[i] = lastA;
                    rsModel.faceIndicesB[i] = lastB;
                    rsModel.faceIndicesC[i] = lastC;
                    break;
                case 4:
                    const oldTrianglePointOffsetX = lastA;
                    lastA = lastB;
                    lastB = oldTrianglePointOffsetX;
                    lastC = vertexDirectionOffsetBuffer.get('SMART', 'UNSIGNED') + accumulator;
                    accumulator = lastC;
                    rsModel.faceIndicesA[i] = lastA;
                    rsModel.faceIndicesB[i] = lastB;
                    rsModel.faceIndicesC[i] = lastC;
                    break;
            }
        }
        vertexDirectionOffsetBuffer.readerIndex = faceMappingsOffset;
        for (let i = 0; i < rsModel.texturedFaceCount; i++) {
            rsModel.texturedFaceIndicesA[i] = vertexDirectionOffsetBuffer.get('SHORT', 'UNSIGNED');
            rsModel.texturedFaceIndicesB[i] = vertexDirectionOffsetBuffer.get('SHORT', 'UNSIGNED');
            rsModel.texturedFaceIndicesC[i] = vertexDirectionOffsetBuffer.get('SHORT', 'UNSIGNED');
        }
        return rsModel;
    }

}
