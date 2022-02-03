declare global {
    interface Array<T> {
        forEachAsync<U = void>(callback: (entry: T) => Promise<U>): Promise<U[]>;
    }

    interface Map<K, V> {
        forEachAsync<U = void>(callback: (value: V, key: K, map: Map<K, V>) => Promise<U>): Promise<U[]>;
    }
}

Array.prototype.forEachAsync = async function<T, U = void>(callback: (entry: T) => Promise<U>): Promise<U[]> {
    if(this === undefined || this === null || !Array.isArray(this) || this.length < 1) {
        return;
    }

    return await Promise.all(this.map(callback));
};

Map.prototype.forEachAsync = async function<K, V, U = void>(callback: (value: V, key: K, map: Map<K, V>) => Promise<U>): Promise<U[]> {
    if(this === undefined || this === null || !(this instanceof Map) || this.size < 1) {
        return;
    }

    const promises = new Array(this.size);
    let i = 0;
    for(const [ key, value ] of this) {
        promises[i++] = callback(value, key, this);
    }

    return await Promise.all(promises);
};

export {};