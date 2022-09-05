import { join } from 'path';
import { logger } from '@runejs/common';
import { FileStoreBase } from '../file-store-base';
import { Jag, caches } from './jag';
import { JagCache } from './jag-cache';
import { JagDatabase } from '../../db/jag';
import { JagArchive } from './jag-archive';


export class JagFileStore extends FileStoreBase<JagDatabase> {

    readonly jag: Jag;
    readonly caches: Map<number, JagCache>;

    constructor(gameBuild: string | number, storePath: string = './') {
        super(gameBuild, storePath);
        this.jag = new Jag(this);
        this.caches = new Map<number, JagCache>();
    }

    override async openDatabase(): Promise<JagDatabase> {
        this._database = new JagDatabase(
            this.gameBuild,
            join(this.fileStorePath, 'index'),
            [ 'error', 'warn' ],
        );
        await this._database.openConnection();
        return this._database;
    }

    override async load(
        loadCacheEntities: boolean = false,
        loadCacheChildEntities: boolean = false,
        loadArchiveChildEntities: boolean = false,
    ): Promise<void> {
        logger.info(`Loading JAG store for build ${this.gameBuild}...`);
        await this.openDatabase();

        if (loadCacheEntities) {
            await this.loadCacheEntities(loadCacheChildEntities, loadArchiveChildEntities);
        }
    }

    /**
     * Load all cache entities for this file store.
     * @param loadCacheChildEntities Whether or not to load cache child file entities.
     * Defaults to `false`.
     * @param loadArchiveChildEntities Whether or not to load archive child file entities.
     * Only works if `loadCacheChildEntities` is also set to `true`. Defaults to `false`.
     */
    async loadCacheEntities(
        loadCacheChildEntities: boolean = false,
        loadArchiveChildEntities: boolean = false,
    ): Promise<void> {
        if (!this.caches.size) {
            const cacheNames = Object.keys(caches);
            for (const cacheName of cacheNames) {
                this.createCache(caches[cacheName]);
            }
        }

        for (const [ , cache ] of this.caches) {
            await cache.loadIndex();
        }

        if (loadCacheChildEntities) {
            logger.info(`Loading cache file entities...`);

            for (const [ , cache ] of this.caches) {
                await cache.loadFileIndexes();
            }

            if (loadArchiveChildEntities) {
                logger.info(`Loading archive file entities...`);

                const archiveIndex = this.getCache('archives');

                for (const [ , file ] of archiveIndex.files) {
                    const archive = file as JagArchive;
                    await archive.loadFileIndexes();
                }
            }
        }
    }

    createCache(cacheKey: number): void {
        this.setCache(cacheKey, new JagCache(this, cacheKey));
    }

    getCache(cacheKey: number): JagCache | null;
    getCache(cacheName: string): JagCache | null;
    getCache(cacheKeyOrName: number | string): JagCache | null;
    getCache(cacheKeyOrName: number | string): JagCache | null {
        if (typeof cacheKeyOrName === 'string') {
            return Array.from(this.caches.values()).find(
                i => i?.index?.name === cacheKeyOrName
            ) || null;
        } else {
            return this.caches.get(cacheKeyOrName) || null;
        }
    }

    setCache(cacheKey: number, cache: JagCache): void;
    setCache(cacheName: string, cache: JagCache): void;
    setCache(cacheKeyOrName: number | string, cache: JagCache): void;
    setCache(cacheKeyOrName: number | string, cache: JagCache): void {
        if (typeof cacheKeyOrName === 'string') {
            this.caches.set(caches[cacheKeyOrName], cache);
        } else {
            this.caches.set(cacheKeyOrName, cache);
        }
    }

}
