import { ByteBuffer } from '@runejs/core/buffer';

import Xtea from './xtea';
import Bzip2 from './bzip2';
import Gzip from './gzip';


export interface StoreFile {
    compression: number;
    buffer: ByteBuffer;
    version?: number;
}


export const compressVersionedFile = (file: StoreFile, keys?: number[]): ByteBuffer => {
    const compressedFileData = new ByteBuffer(file.buffer.length);
    compressedFileData.put(file.compression);

    let compressedLength: number = file.buffer.length;

    if(file.compression === 0) {
        // uncompressed files

        // write the uncompressed file length
        compressedFileData.put(file.buffer.length, 'int');

        // write the uncompressed file data
        compressedFileData.putBytes(file.buffer);
    } else {
        // compressed Bzip2 or Gzip file

        const compressedData: ByteBuffer = file.compression === 1 ?
            Bzip2.compress(file.buffer) : Gzip.compress(file.buffer);

        compressedLength = compressedData.length;

        // write the compressed file length
        compressedFileData.put(compressedLength, 'int');

        // write the uncompressed file length
        compressedFileData.put(file.buffer.length, 'int');

        // write the compressed file data
        compressedFileData.putBytes(compressedData);
    }

    // write the file version
    compressedFileData.put(file.version ?? 0, 'short');

    if(Xtea.validKeys(keys)) {
        // @TODO untested
        const writerIndex = compressedFileData.writerIndex;
        let lengthOffset = writerIndex;
        if(compressedFileData.length - (compressedLength + writerIndex + 4) >= 2) {
            lengthOffset += 2;
        }
        return Xtea.encrypt(compressedFileData, keys, compressedFileData.length - lengthOffset).flipWriter();
    } else {
        return compressedFileData.flipWriter();
    }
};


export const decompressVersionedFile = (buffer: ByteBuffer, keys?: number[]): StoreFile => {
    buffer.readerIndex = 0;

    if(!buffer || buffer.length === 0) {
        return { compression: -1, buffer: null, version: -1 };
    }

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
            throw new Error('MISSING_ENCRYPTION_KEYS');
        }

        let encryptedFileData = new ByteBuffer(
            compression === 1 ? uncompressedLength : (buffer.length - buffer.readerIndex + 2)
        );

        buffer.copy(encryptedFileData, 0, buffer.readerIndex);

        const decompressed: ByteBuffer = compression === 1 ?
            Bzip2.decompress(encryptedFileData) : Gzip.decompress(encryptedFileData);

        buffer.readerIndex = buffer.readerIndex + compressedLength;

        if(decompressed.length !== uncompressedLength) {
            throw new Error(`Compression length mismatch`);
        }

        let version = 0;
        if(buffer.readable >= 2) {
            version = buffer.get('short');
        }

        return { compression, buffer: decompressed, version };
    }
};
