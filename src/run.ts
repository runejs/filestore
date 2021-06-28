import { ClientFileStore, extractIndexedFile, loadXteaRegionFiles } from './client-store';
import { FileStore, IndexedFileGroup } from './file-store';
import { decompressVersionedFile } from './compression';
import { logger } from '@runejs/core';


const xteaRegions = async () => loadXteaRegionFiles('config/xteas');

(async () => {
    const clientFileStore = new ClientFileStore('./packed', {
        configDir: './config',
        xteas: await xteaRegions()
    });

    console.log('');

    // clientFileStore.getAllIndexes().forEach(index => index.generateArchive());

    // await clientFileStore.getIndex(0).generateArchive();

    /*const indexEntry = extractIndexedFile(2, 255, clientFileStore.channels);
    const decompressed = decompressVersionedFile(indexEntry.dataFile);

    console.log(`\n\nDecompressed Original:`);
    console.log(`LENGTH = ${decompressed.buffer.length}`);
    console.log(decompressed.buffer);*/


    const fileStore = new FileStore();

    await fileStore.loadStoreArchives();

    // await fileStore.generateCrcTable();

    const indexCount = fileStore.indexedArchives.size;
    for(let i = 0; i < indexCount; i++) {
        const archive = fileStore.indexedArchives.get(i);
        // if(i === 8) {
            logger.info(`Indexing archive ${i}...`);
            await archive.indexArchiveFiles();
        // }
    }


    /*const testFileId = 0;
    await fileStore.indexedArchives.get(0).unpack(false);
    const testFileGroup = await (fileStore.indexedArchives.get(0).files[testFileId] as IndexedFileGroup).compressGroup();

    console.log(`File ${testFileId} length = ${testFileGroup.length}`);

    const compressionLevel = testFileGroup.get();
    const compressedLength = testFileGroup.get('int');

    console.log(`File ${testFileId} compression = ${compressionLevel}, compressedLength = ${compressedLength}`);*/


    // await fileStore.indexedArchives.get(0).indexArchiveFiles();

    // const configArchive = await fileStore.loadStoreArchive(2, 'configs');

    // await configArchive.indexArchiveFiles();

    /*const packed = await configArchive.compress();

    console.log(`\n\nRe-Packed:`);
    console.log(`LENGTH = ${packed.length}`);
    console.log(packed);*/


    /*const testCacheFile = extractIndexedFile(10, 2, clientFileStore.channels).dataFile;

    console.log('\n\nCompressed Original');
    console.log(`LENGTH = ${testCacheFile.length}`);
    console.log(testCacheFile);

    const decompressedCacheFile = decompressVersionedFile(testCacheFile);

    console.log('\n\nDe-compressed Original');
    console.log(`LENGTH = ${decompressedCacheFile.buffer.length}`);
    console.log(decompressedCacheFile.buffer);



    const archivedFileGroup = await configArchive.getFile(10) as FileGroup;

    const repackedFile = await archivedFileGroup.compress();

    console.log('\n\nRe-compressed File');
    console.log(`LENGTH = ${repackedFile.length}`);
    console.log(repackedFile);

    const reunpackedrepackedFile = decompressVersionedFile(repackedFile);

    console.log('\n\nThe the fuck is this absolute monstrosity of a compression circle jerk');
    console.log(`LENGTH = ${reunpackedrepackedFile.buffer.length}`);
    console.log(reunpackedrepackedFile.buffer);*/
})();
