import { createObject } from '../util/objects';


/**
 * Various options for decompressing packed client file stores.
 */
export class DecompressorOptions {

    /**
     * Defaults to false - Whether or not to ensure that map files have matching decrypted
     * landscape files. Setting this to true will remove all map files (mX_Y.dat) for which the corresponding
     * landscape file (if it has one) does not have any XTEA encryption keys. This helps with finding map files
     * that specifically have valid corresponding landscape files.
     */
    public matchMapFiles: boolean = false;


    /**
     * Whether or not to run the decompressor tools in debug mode - this will prevent files from
     * being written to the disk and will only run the decompression and file conversion code. Debug mode will
     * still write .index files to /output/stores.
     */
    public debug: boolean = false;

    /**
     * Creates a new full `DecompressorOptions` instance from the given partial options object.
     * @param options The partial options object to convert into a full `DecompressorOptions` instance.
     */
    public static create(options?: Partial<DecompressorOptions>): DecompressorOptions {
        return createObject<DecompressorOptions>(DecompressorOptions, options);
    }

}
