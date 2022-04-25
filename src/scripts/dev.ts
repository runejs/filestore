import { Store } from '../index';
import { AnimsTranscoder, BasesTranscoder } from '../content/animations';


export async function dev(): Promise<void> {
    const store = await Store.create('440');
    store.loadPackedStore();

    const animsArchive = store.find('anims');
    const basesArchive = store.find('bases');

    animsArchive.decode(true);
    basesArchive.decode(true);

    const basesTranscoder = new BasesTranscoder(basesArchive);
    const animsTranscoder = new AnimsTranscoder(animsArchive, basesTranscoder);

    for (const [ groupIndex, ] of basesArchive.groups) {
        basesTranscoder.decodeGroup(groupIndex);
    }

    const animationFrameList = animsTranscoder.decodeGroup(0);

    console.log(JSON.stringify(animationFrameList, null, 2));
}

