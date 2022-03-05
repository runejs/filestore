export enum FileState {
    /**
     * File is not yet registered.
     */
    unloaded = 'unloaded',

    /**
     * File has been registered but not read into memory.
     */
    loaded = 'loaded',

    /**
     * File `data` is encrypted.<br>
     * Encryption formats: xtea
     */
    encrypted = 'encrypted',

    /**
     * File `data` has been decrypted.<br>
     * Encryption formats: xtea
     */
    decrypted = 'decrypted',

    /**
     * File `data` is compressed.<br>
     * Compression formats: bzip, gzip
     */
    compressed = 'compressed',

    /**
     * File `data` is encoded for the JS5 format.
     */
    encoded = 'encoded',

    /**
     * File `data` is in raw binary form, uncompressed and unencrypted.
     */
    raw = 'raw',

    /**
     * The file was found, but is empty.
     */
    empty = 'empty',

    /**
     * The file was found, but is corrupted.
     */
    corrupt = 'corrupt',

    /**
     * The file was not found.
     */
    missing = 'missing'
}
