import { ByteBuffer } from '@runejs/core';
import { FilestoreChannels } from './filestore-loader';


export const indexFileLength = 6;
export const dataChunkLength = 512;
export const sectorLength = 520;


export interface IndexChunk {
    readonly indexId: number;
    readonly fileId: number;
    readonly size: number;
    readonly sector: number;
}

export interface IndexedDataChunk {
    indexFile: IndexChunk;
    dataFile: ByteBuffer;
}

export const readIndexedDataChunk = (fileId: number, indexId: number, channels: FilestoreChannels): IndexedDataChunk => {
    const indexFile = readIndexChunk(fileId, indexId, indexId === 255 ?
        channels.metaChannel : channels.indexChannels[indexId]);
    if(!indexFile) {
        throw new Error(`Error parsing index file for file ID ${fileId} in index ${indexId}.`);
    }

    const dataFile = readDataChunk(fileId, indexFile, channels.dataChannel);
    if(!dataFile) {
        throw new Error(`Error parsing data file for file ID ${fileId} in index ${indexId}.`);
    }

    return {indexFile, dataFile};
};

export const readIndexChunk = (fileId: number, indexId: number, indexChannel: ByteBuffer): IndexChunk => {
    let ptr = fileId * indexFileLength;
    if(ptr < 0 || ptr >= indexChannel.length) {
        throw new Error('File Not Found');
    }

    let buf = new ByteBuffer(indexFileLength);
    indexChannel.copy(buf, 0, ptr, ptr + indexFileLength);

    if(buf.readable !== indexFileLength) {
        throw new Error(`Not Enough Readable Index Data: Buffer contains ${buf.readable} but needed ${indexFileLength}`);
    }

    const size = buf.get('INT24');
    const sector = buf.get('INT24');
    return {indexId, fileId, size, sector};
};

export const readDataChunk = (fileId: number, indexFile: IndexChunk, dataChannel: ByteBuffer): ByteBuffer => {
    const data = new ByteBuffer(indexFile.size);

    let chunk = 0, remaining = indexFile.size;
    let ptr = indexFile.sector * sectorLength;

    do {
        let buf = new ByteBuffer(sectorLength);
        dataChannel.copy(buf, 0, ptr, ptr + sectorLength);

        if(buf.readable !== sectorLength) {
            throw new Error(`Not Enough Readable Sector Data: Buffer contains ${buf.readable} but needed ${sectorLength}`);
        }

        const sectorId = buf.get('SHORT', 'UNSIGNED');
        const sectorChunk = buf.get('SHORT', 'UNSIGNED');
        const nextSector = buf.get('INT24');
        const sectorIndex = buf.get('BYTE', 'UNSIGNED');
        const sectorData = new ByteBuffer(dataChunkLength);
        buf.copy(sectorData, 0, buf.readerIndex, buf.readerIndex + dataChunkLength);

        if(remaining > dataChunkLength) {
            sectorData.copy(data, data.writerIndex, 0, dataChunkLength);
            data.writerIndex = (data.writerIndex + dataChunkLength);
            remaining -= dataChunkLength;

            if(sectorIndex !== indexFile.indexId) {
                throw new Error('File type mismatch.');
            }

            if(sectorId !== fileId) {
                throw new Error('File id mismatch.');
            }

            if(sectorChunk !== chunk++) {
                throw new Error('Chunk mismatch.');
            }

            ptr = nextSector * sectorLength;
        } else {
            sectorData.copy(data, data.writerIndex, 0, remaining);
            data.writerIndex = (data.writerIndex + remaining);
            remaining = 0;
        }
    } while(remaining > 0);

    return data;
};

export const writeDataChunk = (indexId: number, archiveId: number, data: ByteBuffer, channels: FilestoreChannels): void => {
    let sector;

    const writeBuffer = new ByteBuffer(sectorLength);

    sector = (channels.dataChannel.length + (sectorLength - 1)) / sectorLength;
    if(sector === 0) {
        sector = 1;
    }

    for(let i = 0; data.readable > 0; i++) {
        let nextSector = 0;
        let writableDataLength = 0;

        if(nextSector == 0) {
            nextSector = (channels.dataChannel.length + (sectorLength - 1)) / sectorLength;
            if(nextSector === 0) {
                nextSector++;
            }

            if(nextSector === sector) {
                nextSector++;
            }
        }

        let writableMax = 512;

        if(0xFFFF < archiveId) {
            if(data.readable <= 510) {
                nextSector = 0;
            }

            writeBuffer.put(archiveId >> 24);
            writeBuffer.put(archiveId >> 16);
            writableMax = 510;
        } else {
            if(data.readable <= 512) {
                nextSector = 0;
            }
        }

        writeBuffer.put(archiveId >> 8);
        writeBuffer.put(archiveId);
        writeBuffer.put(i >> 8);
        writeBuffer.put(i);
        writeBuffer.put(nextSector >> 16);
        writeBuffer.put(nextSector >> 8);
        writeBuffer.put(nextSector);
        writeBuffer.put(indexId);
        channels.dataChannel.writerIndex = sectorLength * sector;
        channels.dataChannel.putBytes(writeBuffer);

        writableDataLength = data.readable;
        if(writableDataLength > writableMax) {
            writableDataLength = writableMax;
        }

        data.copy(writeBuffer, writeBuffer.writerIndex, 0, writableDataLength);
        writeBuffer.copy(channels.dataChannel)
        channels.dataChannel.putBytes(writeBuffer);
        sector = nextSector;
    }
};
