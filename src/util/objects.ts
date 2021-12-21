export const createObject = <T>(objectType: new () => T,
                                options: Map<string, unknown> | Partial<T> | undefined,
                                ignoreCase: boolean = false): T => {
    const object = new objectType();
    const keys = options instanceof Map ? Array.from(options.keys()) : Object.keys(options ?? {});
    if(keys?.length) {
        const objectProps = Object.keys(object);
        keys.forEach(key => {
            const existingKey = objectProps.find(k => {
                if(ignoreCase) {
                    return k.toLowerCase() === key.toLowerCase();
                } else {
                    return k === key;
                }
            });

            if(existingKey) {
                const value = options instanceof Map ? options.get(key) : options[key];
                if(typeof object[existingKey] === 'number') {
                    object[existingKey] = Number(value);
                } else {
                    object[existingKey] = value;
                }
            }
        });
    }

    return object;
};
