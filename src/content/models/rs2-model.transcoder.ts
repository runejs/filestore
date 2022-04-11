import { GroupTranscoder } from '../group-transcoder';
import { ByteBuffer, logger } from '@runejs/common';
import { Rs2Model } from './rs2-model';


export class Rs2ModelTranscoder extends GroupTranscoder<Rs2Model> {

    override decodeGroup(groupKey: number): Rs2Model | null;
    override decodeGroup(groupName: string): Rs2Model | null;
    override decodeGroup(groupKeyOrName: number | string): Rs2Model | null {
        const group = this.findGroup(groupKeyOrName);
        if(!group) {
            return null;
        }

        const { numericKey: groupKey, data: fileData } = group;

        if(this.decodedGroups?.has(groupKey)) {
            return this.decodedGroups.get(groupKey);
        }

        const model = new Rs2Model(groupKey);
        this.decodedGroups.set(groupKey, model);

        const vertexDirectionOffsetBuffer = fileData.clone();
        const xDataOffsetBuffer = fileData.clone();
        const yDataOffsetBuffer = fileData.clone();
        const zDataOffsetBuffer = fileData.clone();
        const vertexSkinOffsetBuffer = fileData.clone();

        let useFaceTypes = false;
        let useFaceTextures = false;

        vertexDirectionOffsetBuffer.readerIndex = fileData.length - 18;
        model.vertexCount = vertexDirectionOffsetBuffer.get('short', 'U');
        model.faceCount = vertexDirectionOffsetBuffer.get('short', 'U');
        model.texturedFaceCount = vertexDirectionOffsetBuffer.get('byte', 'u');

        const hasFaceTypes = vertexDirectionOffsetBuffer.get('byte', 'u');
        const modelPriority = vertexDirectionOffsetBuffer.get('byte', 'u');
        const hasFaceAlphas = vertexDirectionOffsetBuffer.get('byte', 'u');
        const hasFaceSkins = vertexDirectionOffsetBuffer.get('byte', 'u');
        const hasVertexSkins = vertexDirectionOffsetBuffer.get('byte', 'u');
        const verticesXSubOffset = vertexDirectionOffsetBuffer.get('short', 'u');
        const verticesYSubOffset = vertexDirectionOffsetBuffer.get('short', 'u');
        const verticesZSubOffset = vertexDirectionOffsetBuffer.get('short', 'u');
        const faceIndicesSubOffset = vertexDirectionOffsetBuffer.get('short', 'u');

        let offset = 0;
        const vertexFlagsOffset = offset;
        offset += model.vertexCount;

        const facesCompressTypeOffset = offset;
        offset += model.faceCount;

        const facePrioritiesOffset = offset;
        if(modelPriority == 255) {
            offset += model.faceCount;
        }

        const faceSkinsOffset = offset;
        if(hasFaceSkins == 1) {
            offset += model.faceCount;
        }

        const faceTypesOffset = offset;
        if(hasFaceTypes == 1) {
            offset += model.faceCount;
        }

        const vertexSkinsOffset = offset;
        if(hasVertexSkins == 1) {
            offset += model.vertexCount;
        }

        const faceAlphasOffset = offset;
        if(hasFaceAlphas == 1) {
            offset += model.faceCount;
        }

        const faceIndicesOffset = offset;
        offset += faceIndicesSubOffset;
        const faceColorsOffset = offset;
        offset += model.faceCount * 2;
        const faceMappingsOffset = offset;
        offset += model.texturedFaceCount * 6;
        const verticesXOffset = offset;
        offset += verticesXSubOffset;
        const verticesYOffset = offset;
        offset += verticesYSubOffset;
        const verticesZOffset = offset;
        offset += verticesZSubOffset; // offset is not referenced again after this

        model.verticesX = new Array(model.vertexCount);
        model.verticesY = new Array(model.vertexCount);
        model.verticesZ = new Array(model.vertexCount);
        model.faceIndicesA = new Uint16Array(model.faceCount);
        model.faceIndicesB = new Uint16Array(model.faceCount);
        model.faceIndicesC = new Uint16Array(model.faceCount);

        if(model.texturedFaceCount > 0) {
            model.texturedFaceTypes = new Uint8Array(model.texturedFaceCount);
            model.texturedFaceIndicesA = new Uint16Array(model.texturedFaceCount);
            model.texturedFaceIndicesB = new Uint16Array(model.texturedFaceCount);
            model.texturedFaceIndicesC = new Uint16Array(model.texturedFaceCount);
        }
        if(hasVertexSkins == 1) {
            model.vertexSkins = new Array(model.texturedFaceCount);
        }
        if(hasFaceTypes == 1) {
            model.faceTypes = new Uint32Array(model.faceCount);
            model.texturedFaceTypeIndices = new Int8Array(model.faceCount);
            model.faceTextures = new Int8Array(model.faceCount);
        }
        if(modelPriority == 255) {
            model.facePriorities = new Uint8Array(model.faceCount);
        } else {
            model.facePriority = modelPriority & 128;
        }
        if(hasFaceAlphas == 1) {
            model.faceAlphas = new Uint8Array(model.faceCount);
        }
        if(hasFaceSkins == 1) {
            model.faceSkins = new Array(model.faceCount);
        }

        model.faceColors = new Uint32Array(model.faceCount);
        vertexDirectionOffsetBuffer.readerIndex = vertexFlagsOffset;
        xDataOffsetBuffer.readerIndex = verticesXOffset;
        yDataOffsetBuffer.readerIndex = verticesYOffset;
        zDataOffsetBuffer.readerIndex = verticesZOffset;
        vertexSkinOffsetBuffer.readerIndex = vertexSkinsOffset;

        let baseOffsetX = 0;
        let baseOffsetY = 0;
        let baseOffsetZ = 0;

        for(let i = 0; i < model.vertexCount; i++) {
            const mask = vertexDirectionOffsetBuffer.get('byte', 'u');
            let xOffset = 0;
            if((mask & 0x1) != 0) {
                try {
                    xOffset = xDataOffsetBuffer.get('smart_short', 'u');
                } catch {
                    logger.warn('Tried to read out of range xOffset for object', groupKey);
                }
            }

            let yOffset = 0;
            if((mask & 0x2) != 0) {
                try {
                    yOffset = yDataOffsetBuffer.get('smart_short', 'u');
                } catch {
                    logger.warn('Tried to read out of range yOffset for object', groupKey);
                }
            }

            let zOffset = 0;
            if((mask & 0x4) != 0) {
                try {
                    zOffset = zDataOffsetBuffer.get('smart_short', 'u');
                } catch {
                    logger.warn('Tried to read out of range zOffset for object', groupKey);
                }
            }

            model.verticesX[i] = baseOffsetX + xOffset;
            model.verticesY[i] = baseOffsetY + yOffset;
            model.verticesZ[i] = baseOffsetZ + zOffset;
            baseOffsetX = model.verticesX[i];
            baseOffsetY = model.verticesY[i];
            baseOffsetZ = model.verticesZ[i];
            if(hasVertexSkins == 1) {
                model.vertexSkins[i] = vertexSkinOffsetBuffer.get('byte', 'u');
            }
        }

        vertexDirectionOffsetBuffer.readerIndex = faceColorsOffset;
        xDataOffsetBuffer.readerIndex = faceTypesOffset;
        yDataOffsetBuffer.readerIndex = facePrioritiesOffset;
        zDataOffsetBuffer.readerIndex = faceAlphasOffset;
        vertexSkinOffsetBuffer.readerIndex = faceSkinsOffset;
        for(let i = 0; i < model.faceCount; i++) {
            model.faceColors[i] = vertexDirectionOffsetBuffer.get('short', 'u');
            if(hasFaceTypes == 1) {
                const mask = xDataOffsetBuffer.get('BYTE', 'u');
                if((mask & 0x1) == 1) {
                    model.faceTypes[i] = 1;
                    useFaceTypes = true;
                } else {
                    model.faceTypes[i] = 0;
                }

                if((mask & 0x2) == 2) {
                    model.texturedFaceTypeIndices[i] = mask >> 2;
                    model.faceTextures[i] = model.faceColors[i];
                    model.faceColors[i] = 127;
                    if(model.faceTextures[i] != -1) {
                        useFaceTextures = true;
                    }
                } else {
                    model.texturedFaceTypeIndices[i] = -1;
                    model.faceTextures[i] = -1;
                }
            }

            if(modelPriority == 255) {
                model.facePriorities[i] = yDataOffsetBuffer.get('byte', 'u');
            }
            if(hasFaceAlphas == 1) {
                model.faceAlphas[i] = zDataOffsetBuffer.get('byte', 'u');
            }
            if(hasFaceSkins == 1) {
                model.faceSkins[i] = vertexSkinOffsetBuffer.get('byte', 'u');
            }
        }

        vertexDirectionOffsetBuffer.readerIndex = faceIndicesOffset;
        xDataOffsetBuffer.readerIndex = facesCompressTypeOffset;

        let lastA = 0;
        let lastB = 0;
        let lastC = 0;
        let accumulator = 0;
        let oldTrianglePointOffsetX;

        for(let i = 0; i < model.faceCount; i++) {
            const type = xDataOffsetBuffer.get('byte', 'u');
            switch(type) {
                case 1:
                    lastA = vertexDirectionOffsetBuffer.get('smart_short', 'u') + accumulator;
                    accumulator = lastA;
                    lastB = vertexDirectionOffsetBuffer.get('smart_short', 'u') + accumulator;
                    accumulator = lastB;
                    lastC = vertexDirectionOffsetBuffer.get('smart_short', 'u') + accumulator;
                    accumulator = lastC;
                    model.faceIndicesA[i] = lastA;
                    model.faceIndicesB[i] = lastB;
                    model.faceIndicesC[i] = lastC;
                    break;
                case 2:
                    lastB = lastC;
                    lastC = vertexDirectionOffsetBuffer.get('smart_short', 'u') + accumulator;
                    accumulator = lastC;
                    model.faceIndicesA[i] = lastA;
                    model.faceIndicesB[i] = lastB;
                    model.faceIndicesC[i] = lastC;
                    break;
                case 3:
                    lastA = lastC;
                    lastC = vertexDirectionOffsetBuffer.get('smart_short', 'u') + accumulator;
                    accumulator = lastC;
                    model.faceIndicesA[i] = lastA;
                    model.faceIndicesB[i] = lastB;
                    model.faceIndicesC[i] = lastC;
                    break;
                case 4:
                    oldTrianglePointOffsetX = lastA;
                    lastA = lastB;
                    lastB = oldTrianglePointOffsetX;
                    lastC = vertexDirectionOffsetBuffer.get('smart_short', 'u') + accumulator;
                    accumulator = lastC;
                    model.faceIndicesA[i] = lastA;
                    model.faceIndicesB[i] = lastB;
                    model.faceIndicesC[i] = lastC;
                    break;
            }
        }

        vertexDirectionOffsetBuffer.readerIndex = faceMappingsOffset;
        for(let i = 0; i < model.texturedFaceCount; i++) {
            model.texturedFaceIndicesA[i] = vertexDirectionOffsetBuffer.get('short', 'u');
            model.texturedFaceIndicesB[i] = vertexDirectionOffsetBuffer.get('short', 'u');
            model.texturedFaceIndicesC[i] = vertexDirectionOffsetBuffer.get('short', 'u');
        }

        if(model.texturedFaceTypeIndices != null) {
            let useTexturedFaceTypeIndices = false;
            for(let face = 0; face < model.faceCount; face++) {
                const texturedFaceTypeIndex = model.texturedFaceTypeIndices[face] & 0xff;
                if(texturedFaceTypeIndex != 255) {
                    if((model.texturedFaceIndicesA[texturedFaceTypeIndex] & 0xffff) ===
                        model.faceIndicesA[face] &&
                        (model.texturedFaceIndicesB[texturedFaceTypeIndex] & 0xffff) ===
                        model.faceIndicesB[face] &&
                        (model.texturedFaceIndicesC[texturedFaceTypeIndex] & 0xffff) ===
                        model.faceIndicesC[face]) {
                        model.texturedFaceTypeIndices[face] = -1;
                    } else {
                        useTexturedFaceTypeIndices = true;
                    }
                }
            }

            if(!useTexturedFaceTypeIndices) {
                model.texturedFaceTypeIndices = null;
            }
        }

        if(!useFaceTextures) {
            model.faceTextures = null;
        }
        if(!useFaceTypes) {
            model.faceTypes = null;
        }

        return model;
    }

    override encodeGroup(groupKey: number): ByteBuffer | null;
    override encodeGroup(groupName: string): ByteBuffer | null;
    override encodeGroup(groupKeyOrName: number | string): ByteBuffer | null {
        const group = this.findGroup(groupKeyOrName);
        if(!group) {
            return null;
        }

        // @TODO model encoding
        return null;
    }

}
