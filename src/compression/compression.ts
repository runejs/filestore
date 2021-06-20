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
    let newFileData: ByteBuffer;
    let newFileLength: number;

    if(file.compression === 0) {
        // uncompressed files
        newFileData = new ByteBuffer(file.buffer.length + 7);

        // indicate that no file compression is applied
        newFileData.put(0);

        // write the uncompressed file length
        newFileData.put(file.buffer.length, 'int');

        // write the uncompressed file data
        newFileData.putBytes(file.buffer);

        newFileLength = file.buffer.length;
    } else {
        // compressed Bzip2 or Gzip file

        const compressedData: ByteBuffer = file.compression === 1 ?
            Bzip2.compress(file.buffer) : Gzip.compress(file.buffer);

        const compressedLength: number = compressedData.length;

        newFileData = new ByteBuffer(compressedData.length + 11);

        // indicate which type of file compression was used (1 or 2)
        newFileData.put(file.compression);

        // write the compressed file length
        newFileData.put(compressedLength, 'int');

        // write the uncompressed file length
        newFileData.put(file.buffer.length, 'int');

        // write the compressed file data
        newFileData.putBytes(compressedData);

        newFileLength = compressedLength;
    }

    if(!newFileData) {
        return null;
    }

    // write the file version
    if(file.version) {
        newFileData.put(file.version, 'short');
    }

    if(Xtea.validKeys(keys)) {
        // @TODO untested
        const writerIndex = newFileData.writerIndex;
        let lengthOffset = writerIndex;
        if(newFileData.length - (newFileLength + writerIndex + 4) >= 2) {
            lengthOffset += 2;
        }
        return Xtea.encrypt(newFileData, keys, newFileData.length - lengthOffset).flipWriter();
    } else {
        return newFileData.flipWriter();
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
