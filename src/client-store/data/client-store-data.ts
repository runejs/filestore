import { ByteBuffer } from '@runejs/core/buffer';

import { ClientStoreChannel } from './client-store-loader';


export const indexDataLength = 6;
export const sectorDataLength = 512;
export const fullSectorLength = 520;


export interface IndexMetadata {
    readonly indexId: number;
    readonly fileId: number;
    readonly size: number;
    readonly sector: number;
}

export interface ExtractedFile {
    indexFile: IndexMetadata;
    dataFile: ByteBuffer;
}


export const extractIndexedFile = (fileId: number, indexId: number, channels: ClientStoreChannel): ExtractedFile => {
    const indexFile = extractIndexData(fileId, indexId, indexId === 255 ?
        channels.metaChannel : channels.indexChannels[indexId]);
    if(!indexFile) {
        throw new Error(`Error parsing index file for file ID ${fileId} in index ${indexId}.`);
    }

    const dataFile = extractFileData(fileId, indexFile, channels.dataChannel);
    if(!dataFile) {
        throw new Error(`Error parsing data file for file ID ${fileId} in index ${indexId}.`);
    }

    return { indexFile, dataFile };
};


export const extractIndexData = (fileId: number, indexId: number, indexChannel: ByteBuffer): IndexMetadata => {
    let ptr = fileId * indexDataLength;
    if(ptr < 0 || ptr >= indexChannel.length) {
        throw new Error('File Not Found');
    }

    let buf = new ByteBuffer(indexDataLength);
    indexChannel.copy(buf, 0, ptr, ptr + indexDataLength);

    if(buf.readable !== indexDataLength) {
        throw new Error(`Not Enough Readable Index Data: Buffer contains ${buf.readable} but needed ${indexDataLength}`);
    }

    const size = buf.get('INT24');
    const sector = buf.get('INT24');
    return { indexId, fileId, size, sector };
};

export const writeIndexData = (indexChunk: IndexMetadata, indexChannel: ByteBuffer): void => {
    const indexBuffer = new ByteBuffer(indexDataLength);
    indexBuffer.put(indexChunk.size, 'INT24');
    indexBuffer.put(indexChunk.sector, 'INT24');

    indexChannel.writerIndex = indexChunk.indexId * indexDataLength;
    indexChannel.putBytes(indexBuffer);
};


export const extractFileData = (fileId: number, indexFile: IndexMetadata, dataChannel: ByteBuffer): ByteBuffer => {
    const data = new ByteBuffer(indexFile.size);

    let chunk = 0, remaining = indexFile.size;
    let ptr = indexFile.sector * fullSectorLength;

    do {
        let buf = new ByteBuffer(fullSectorLength);
        dataChannel.copy(buf, 0, ptr, ptr + fullSectorLength);

        if(buf.readable !== fullSectorLength) {
            throw new Error(`Not Enough Readable Sector Data: Buffer contains ${buf.readable} but needed ${fullSectorLength}`);
        }

        const sectorId = buf.get('SHORT', 'UNSIGNED');
        const sectorChunk = buf.get('SHORT', 'UNSIGNED');
        const nextSector = buf.get('INT24');
        const sectorIndex = buf.get('BYTE', 'UNSIGNED');
        const sectorData = new ByteBuffer(sectorDataLength);
        buf.copy(sectorData, 0, buf.readerIndex, buf.readerIndex + sectorDataLength);

        if(remaining > sectorDataLength) {
            sectorData.copy(data, data.writerIndex, 0, sectorDataLength);
            data.writerIndex = (data.writerIndex + sectorDataLength);
            remaining -= sectorDataLength;

            if(sectorIndex !== indexFile.indexId) {
                throw new Error('File type mismatch.');
            }

            if(sectorId !== fileId) {
                throw new Error('File id mismatch.');
            }

            if(sectorChunk !== chunk++) {
                throw new Error('Chunk mismatch.');
            }

            ptr = nextSector * fullSectorLength;
        } else {
            sectorData.copy(data, data.writerIndex, 0, remaining);
            data.writerIndex = (data.writerIndex + remaining);
            remaining = 0;
        }
    } while(remaining > 0);

    return data;
};

export const writeFileData = (indexId: number, fileId: number, fileBuffer: ByteBuffer, filestoreChannels: ClientStoreChannel): void => {
    let sector;

    const writeBuffer = new ByteBuffer(fullSectorLength);

    sector = (filestoreChannels.dataChannel.length + (fullSectorLength - 1)) / fullSectorLength;
    if(sector === 0) {
        sector = 1;
    }

    for(let i = 0; fileBuffer.readable > 0; i++) {
        let nextSector = 0;
        let writableDataLength = 0;

        if(nextSector === 0) {
            nextSector = (filestoreChannels.dataChannel.length + (fullSectorLength - 1)) / fullSectorLength;
            if(nextSector === 0) {
                nextSector++;
            }

            if(nextSector === sector) {
                nextSector++;
            }
        }

        let writableMax;

        if(0xFFFF < fileId) {
            writableMax = 510;
            writeBuffer.put(fileId, 'INT');
        } else {
            writableMax = 512;
            writeBuffer.put(fileId, 'SHORT');
        }

        if(fileBuffer.readable <= writableMax) {
            nextSector = 0;
        }

        writeBuffer.put(i, 'SHORT');
        writeBuffer.put(nextSector, 'INT24');
        writeBuffer.put(indexId);

        filestoreChannels.dataChannel.writerIndex = fullSectorLength * sector;

        // Ensure space
        if(filestoreChannels.dataChannel.length < filestoreChannels.dataChannel.writerIndex + writeBuffer.length) {
            const newBuffer = new ByteBuffer(filestoreChannels.dataChannel.writerIndex + writeBuffer.length);
            filestoreChannels.dataChannel.copy(newBuffer, 0, 0, filestoreChannels.dataChannel.length);
            newBuffer.writerIndex = filestoreChannels.dataChannel.writerIndex;
            filestoreChannels.dataChannel = newBuffer;
        }

        // Write the header
        filestoreChannels.dataChannel.putBytes(writeBuffer.getSlice(0, 8));

        writableDataLength = fileBuffer.readable;
        if(writableDataLength > writableMax) {
            writableDataLength = writableMax;
        }

        writeBuffer.putBytes(fileBuffer.getSlice(fileBuffer.readerIndex, writableDataLength));
        fileBuffer.readerIndex += writableDataLength;

        // Ensure space
        if(filestoreChannels.dataChannel.length < filestoreChannels.dataChannel.writerIndex + writeBuffer.length) {
            const newBuffer = new ByteBuffer(filestoreChannels.dataChannel.writerIndex + writeBuffer.length);
            filestoreChannels.dataChannel.copy(newBuffer, 0, 0, filestoreChannels.dataChannel.length);
            newBuffer.writerIndex = filestoreChannels.dataChannel.writerIndex;
            filestoreChannels.dataChannel = newBuffer;
        }

        // Write the sector
        filestoreChannels.dataChannel.putBytes(writeBuffer.getSlice(writeBuffer.readerIndex, writeBuffer.length - writeBuffer.readerIndex));

        sector = nextSector;
    }
};
