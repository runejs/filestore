import { ByteBuffer } from '@runejs/core/buffer';

import Xtea from './xtea';
import Bzip2 from './bzip2';
import Gzip from './gzip';
import { logger } from '@runejs/core';


export interface StoreFile {
    compression: number;
    buffer: ByteBuffer;
    version?: number;
}


export const compressFile = (file: StoreFile): ByteBuffer => {
    let newFileData: ByteBuffer;

    if(file.compression === 0) {
        // uncompressed files
        newFileData = new ByteBuffer(file.buffer.length + (file.version !== undefined ? 7 : 5));

        // indicate that no file compression is applied
        newFileData.put(0);

        // write the uncompressed file length
        newFileData.put(file.buffer.length, 'int');

        // write the uncompressed file data
        newFileData.putBytes(file.buffer);
    } else {
        // compressed Bzip2 or Gzip file

        const compressedData: ByteBuffer = file.compression === 1 ?
            Bzip2.compress(file.buffer) : Gzip.compress(file.buffer);

        const compressedLength: number = compressedData.length;

        newFileData = new ByteBuffer(compressedData.length + (file.version !== undefined ? 11 : 9));

        // indicate which type of file compression was used (1 or 2)
        newFileData.put(file.compression);

        // write the compressed file length
        newFileData.put(compressedLength, 'int');

        // write the uncompressed file length
        newFileData.put(file.buffer.length, 'int');

        // write the compressed file data
        newFileData.putBytes(compressedData);
    }

    if(!newFileData) {
        return null;
    }

    // write the file version in the file footer (if supplied)
    if(file.version !== undefined) {
        newFileData.put(file.version, 'short');
    }

    return newFileData.flipWriter();
};


export const decompressFile = (buffer: ByteBuffer, keys?: number[]): StoreFile => {
    if(!buffer || buffer.length === 0) {
        return { compression: -1, buffer: null, version: -1 };
    }

    buffer.readerIndex = 0;

    const compression = buffer.get('byte', 'unsigned');
    const compressedLength = buffer.get('int');

    if(Xtea.validKeys(keys)) {
        // Decode xtea encrypted file
        const readerIndex = buffer.readerIndex;
        let lengthOffset = readerIndex;
        if(buffer.length - (compressedLength + readerIndex + 4) >= 2) {
            lengthOffset += 2;
        }
        const decryptedData = Xtea.decrypt(buffer, keys, buffer.length - lengthOffset);
        decryptedData.copy(buffer, readerIndex, 0);
        buffer.readerIndex = readerIndex;
    } else {
        logger.error(`Invalid keys: ${keys}`);
    }

    if(compression === 0) {
        // Uncompressed file
        const data = new ByteBuffer(compressedLength);
        buffer.copy(data, 0, buffer.readerIndex, compressedLength);
        // const decryptedData = decryptXtea(data, keys, compressedLength); @TODO why is this called down here again?
        buffer.readerIndex = (buffer.readerIndex + compressedLength);

        let version = 0;
        if(buffer.readable >= 2) {
            version = buffer.get('short');
        }

        return { compression, buffer: data, version };
    } else {
        // Compressed file
        const uncompressedLength = buffer.get('int');
        if(uncompressedLength < 0) {
            throw new Error(`Invalid uncompressed length`);
        }

        let encryptedFileData = new ByteBuffer(
            compression === 1 ? uncompressedLength : (buffer.length - buffer.readerIndex + 2)
        );

        buffer.copy(encryptedFileData, 0, buffer.readerIndex);

        try {
            const decompressed: ByteBuffer = compression === 1 ?
                Bzip2.decompress(encryptedFileData) : Gzip.decompress(encryptedFileData);

            buffer.readerIndex = buffer.readerIndex + compressedLength;

            if(decompressed.length !== uncompressedLength) {
                throw new Error(`Compression length mismatch`);
            }

            // Read the file footer
            let version = 0;
            if(buffer.readable >= 2) {
                version = buffer.get('short');
            }

            return { compression, buffer: decompressed, version };
        } catch(error) {
            // logger.error(error);
            return { compression, buffer: null };
        }
    }
};
