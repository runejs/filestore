import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { logger } from '@runejs/common';
import { JagInterfaceArchive } from '../file-system/jag/content/archives/interfaces/jag-interface-archive';
import { join } from 'path';
import { Js5FileStore, JagFileStore } from '../file-system';


const saveInterfaces = async (store: JagFileStore) => {
    logger.info(`Decoding game interfaces...`);

    const interfaceArchive = new JagInterfaceArchive(store);

    await interfaceArchive.decodeAll();

    logger.info(`${interfaceArchive.interfaces.size} interfaces decoded. Saving interface entities...`);

    await interfaceArchive.saveAll();
};


const dumpInterfaceFile = (store: JagFileStore) => {
    const archive = store.getCache('archives')
        .getArchive('interface.jag');

    if (!archive) {
        throw new Error('interface.jag archive is not loaded!');
    }

    const dataFile = archive.getFile('data');
    const binaryData = dataFile?.data?.buffer;
    if (!binaryData?.length) {
        throw new Error('interface.jag data file is not loaded!');
    }

    const outputDir = join('.', 'unpacked', 'jag', 'interface.jag');
    if (!existsSync(outputDir)) {
        mkdirSync(outputDir, { recursive: true });
    }

    const outputFile = join(outputDir, 'data');

    logger.info(`Writing file ${outputFile}`);

    writeFileSync(outputFile, binaryData);
};


const dev = async () => {
    const start = Date.now();

    const store = new JagFileStore(327);
    await store.load(true, true, true);

    await saveInterfaces(store);

    const end = Date.now();
    logger.info(`Operations completed in ${(end - start) / 1000} seconds.`);
};

dev().catch(console.error);
