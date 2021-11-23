import { logger, ByteBuffer } from '@runejs/common';
import { FileCompression } from '@runejs/common/compression';
import { Js5Store } from './js5-store';
import { Js5Archive } from './js5-archive';
import { AssetFile, FileOptions } from '../fs';


export class Js5File extends AssetFile {

    public readonly store: Js5Store;
    public readonly archive: Js5Archive;

    public constructor(index: string | number, store: Js5Store, options?: FileOptions);
    public constructor(index: string | number, archive: Js5Archive, options?: FileOptions);
    public constructor(index: string | number, store: Js5Store, archive: Js5Archive, options?: FileOptions);
    public constructor(index: string | number, arg1: Js5Store | Js5Archive, arg2?: Js5Archive, options?: FileOptions) {
        super(index, options);

        let store: Js5Store;
        let archive: Js5Archive;
        if(arg1 instanceof Js5Archive) {
            archive = arg1;
            store = arg1.store;
        } else {
            store = arg1;
            archive = arg2;
        }

        this.store = store;
        this.archive = archive;
        this._name = this.index;
    }

    public extractPackedFile(): ByteBuffer | null {
        const indexDataLength = 6;

        const archiveIndex = this.archive?.index ?? '255';
        const dataChannel = this.store.packedDataChannel;
        const indexChannel = archiveIndex === '255' ? this.store.packedMainIndexChannel :
            this.store.packedIndexChannels.get(archiveIndex);

        let pointer = this.numericIndex * indexDataLength;

        if(pointer < 0 || pointer >= indexChannel.length) {
            if(this.archive) {
                logger.error(`File ${this.index} was not found within the packed ${this.archive.name} archive index file.`);
            } else {
                logger.error(`File ${this.index} was not found within the provided index file.`);
            }
            return null;
        }

        const fileIndexData = new ByteBuffer(indexDataLength);
        indexChannel.copy(fileIndexData, 0, pointer, pointer + indexDataLength);

        if(fileIndexData.readable !== indexDataLength) {
            logger.error(`Error reading packed file ${this.index}, the end of the data stream was reached.`);
            return null;
        }

        this._size = fileIndexData.get('int24', 'unsigned');
        const stripeCount = fileIndexData.get('int24', 'unsigned');

        const data = new ByteBuffer(this.size);
        const stripeDataLength = 512;
        const stripeLength = 520;

        let stripe = 0, remaining = this.size;
        pointer = stripeCount * stripeLength;

        do {
            const temp = new ByteBuffer(stripeLength);
            dataChannel.copy(temp, 0, pointer, pointer + stripeLength);

            if(temp.readable !== stripeLength) {
                logger.error(`Error reading sector for packed file ${this.index}, the end of the data stream was reached.`);
                return null;
            }

            const stripeFileIndex = temp.get('short', 'unsigned');
            const currentStripe = temp.get('short', 'unsigned');
            const nextStripe = temp.get('int24', 'unsigned');
            const stripeArchiveIndex = temp.get('byte', 'unsigned');
            const stripeData = new ByteBuffer(stripeDataLength);
            temp.copy(stripeData, 0, temp.readerIndex,
                temp.readerIndex + stripeDataLength);

            if(remaining > stripeDataLength) {
                stripeData.copy(data, data.writerIndex, 0, stripeDataLength);
                data.writerIndex = (data.writerIndex + stripeDataLength);
                remaining -= stripeDataLength;

                if(this.archive && stripeArchiveIndex !== this.archive.numericIndex) {
                    logger.error(`Packed file ${this.index}'s archive index does not match. ` +
                        `Expected ${this.archive.index} but received ${stripeFileIndex}`);
                    return null;
                }

                if(stripeFileIndex !== this.numericIndex) {
                    logger.error(`Packed file ${this.index} does not match read index ${stripeFileIndex}.`);
                    return null;
                }

                if(currentStripe !== stripe++) {
                    logger.error(`Error loading packed file ${this.index}, file corrupt.`);
                    return null;
                }

                pointer = nextStripe * stripeLength;
            } else {
                stripeData.copy(data, data.writerIndex, 0, remaining);
                data.writerIndex = (data.writerIndex + remaining);
                remaining = 0;
            }
        } while(remaining > 0);

        this.setData(data, true);
        return this._data;
    }

    public override get compression(): FileCompression {
        return this._compression ?? this.archive?.compression ?? FileCompression.none;
    }

    public override set compression(compression: FileCompression) {
        this._compression = compression;
    }
}
