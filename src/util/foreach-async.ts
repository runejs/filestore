declare global {
    interface Array<T> {
        forEachAsync<U = void>(callback: (entry: T) => Promise<U>): Promise<void>;
    }
}

Array.prototype.forEachAsync = async function<T, U = void>(callback: (entry: T) => Promise<U>) {
    if(this === undefined || this === null || !Array.isArray(this) || this.length < 1) {
        return;
    }

    await Promise.all(this.map(callback));
}

export {};