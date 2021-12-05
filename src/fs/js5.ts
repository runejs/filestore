import { join } from 'path';
import { existsSync, readFileSync, readdirSync, statSync } from 'graceful-fs';
import { logger } from '@runejs/common';
import { ByteBuffer } from '@runejs/common/buffer';
import { Store } from './store';
import { Archive } from './archive';
import { FileProperties } from './file-properties';


export class Js5Store {

    public readonly store: Store;

    public mainIndex: ByteBuffer;
    public archiveIndexes: Map<string, ByteBuffer>;
    public archiveData: ByteBuffer;

    public constructor(store: Store) {
        this.store = store;
    }

    // @TODO move to flat-file as js5Decode
    public extractFile(archive: Archive | Store, fileKey: string | number): { properties: FileProperties, data: ByteBuffer } | null {
        const indexDataLength = 6;
        const usingMainIndex = archive instanceof Store;
        const archiveIndex = archive instanceof Archive ? archive.numericKey : 255;
        const indexChannel = usingMainIndex ? this.mainIndex : this.archiveIndexes.get(String(archiveIndex));
        const dataChannel = this.archiveData;
        const numericKey = Number(fileKey);
        const fileProps = new FileProperties({ key: String(fileKey) });

        let pointer = numericKey * indexDataLength;

        if(pointer < 0 || pointer >= indexChannel.length) {
            if(!usingMainIndex) {
                logger.error(`File ${fileKey} was not found within the JS5 ${archive.name} archive index file.`);
            } else {
                logger.error(`Archive ${fileKey} was not found within the main index file.`);
            }

            return null;
        }

        const fileIndexData = new ByteBuffer(indexDataLength);
        indexChannel.copy(fileIndexData, 0, pointer, pointer + indexDataLength);

        if(fileIndexData.readable !== indexDataLength) {
            logger.error(`Error extracting JS5 file ${fileKey}: the end of the data stream was reached.`);
            return null;
        }

        fileProps.size = fileIndexData.get('int24', 'unsigned');
        const stripeCount = fileIndexData.get('int24', 'unsigned');

        if(fileProps.size <= 0) {
            logger.warn(`Extracted JS5 file ${fileKey} has a recorded size of 0, no file data will be extracted.`);
            return { data: new ByteBuffer([]), properties: fileProps };
        }

        const data = new ByteBuffer(fileProps.size);
        const stripeDataLength = 512;
        const stripeLength = 520;

        let stripe = 0;
        let remaining = fileProps.size;
        pointer = stripeCount * stripeLength;

        do {
            const temp = new ByteBuffer(stripeLength);
            dataChannel.copy(temp, 0, pointer, pointer + stripeLength);

            if(temp.readable !== stripeLength) {
                logger.error(`Error reading stripe for packed file ${fileKey}, the end of the data stream was reached.`);
                return null;
            }

            const stripeFileIndex = temp.get('short', 'unsigned');
            const currentStripe = temp.get('short', 'unsigned');
            const nextStripe = temp.get('int24', 'unsigned');
            const stripeArchiveIndex = temp.get('byte', 'unsigned');
            const stripeData = new ByteBuffer(stripeDataLength);
            temp.copy(stripeData, 0, temp.readerIndex, temp.readerIndex + stripeDataLength);

            if(remaining > stripeDataLength) {
                stripeData.copy(data, data.writerIndex, 0, stripeDataLength);
                data.writerIndex = (data.writerIndex + stripeDataLength);
                remaining -= stripeDataLength;

                if(stripeArchiveIndex !== archiveIndex) {
                    logger.error(`Archive index mismatch, expected archive ${archiveIndex} but found archive ${stripeFileIndex}`);
                    return null;
                }

                if(stripeFileIndex !== numericKey) {
                    logger.error(`File index mismatch, expected ${fileKey} but found ${stripeFileIndex}.`);
                    return null;
                }

                if(currentStripe !== stripe++) {
                    logger.error(`Error extracting JS5 file ${fileKey}, file data is corrupted.`);
                    return null;
                }

                pointer = nextStripe * stripeLength;
            } else {
                stripeData.copy(data, data.writerIndex, 0, remaining);
                data.writerIndex = (data.writerIndex + remaining);
                remaining = 0;
            }
        } while(remaining > 0);

        if(data?.length) {
            return { data, properties: fileProps };
        } else {
            return null;
        }
    }

    public load(): void {
        const js5StorePath = join(this.store.path, 'js5');

        if(!existsSync(js5StorePath)) {
            throw new Error(`${js5StorePath} could not be found.`);
        }

        const stats = statSync(js5StorePath);
        if(!stats?.isDirectory()) {
            throw new Error(`${js5StorePath} is not a valid directory.`);
        }

        const storeFileNames = readdirSync(js5StorePath);
        const dataFile = 'main_file_cache.dat2'; // @TODO support more
        const mainIndexFile = 'main_file_cache.idx255';

        if(storeFileNames.indexOf(dataFile) === -1) {
            throw new Error(`The main ${dataFile} data file could not be found.`);
        }

        if(storeFileNames.indexOf(mainIndexFile) === -1) {
            throw new Error(`The main ${mainIndexFile} index file could not be found.`);
        }

        const indexFilePrefix = 'main_file_cache.idx';
        const dataFilePath = join(js5StorePath, dataFile);
        const mainIndexFilePath = join(js5StorePath, mainIndexFile);

        this.archiveData = new ByteBuffer(readFileSync(dataFilePath));
        this.mainIndex = new ByteBuffer(readFileSync(mainIndexFilePath));
        this.archiveIndexes = new Map<string, ByteBuffer>();

        for(const fileName of storeFileNames) {
            if(!fileName?.length || fileName === mainIndexFile || fileName === dataFile) {
                continue;
            }

            if(!fileName.startsWith(indexFilePrefix)) {
                continue;
            }

            const index = fileName.substring(fileName.indexOf('.idx') + 4);
            const numericIndex = Number(index);

            if(isNaN(numericIndex)) {
                logger.error(`Index file ${fileName} does not have a valid extension.`);
            }

            if(!this.store.has(index)) {
                logger.warn(`Archive ${index} was found within the JS5 store, but is not configured for flat file store use.`,
                    `Please add the archive to the archives.json5 configuration file to load it properly.`);
                continue;
            }

            const fileData = new ByteBuffer(readFileSync(join(js5StorePath, fileName)));
            this.archiveIndexes.set(index, fileData);
        }
    }

}
