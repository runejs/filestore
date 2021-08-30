export const createObject = <T>(objectType: new () => T,
                                options: Map<string, unknown> | Partial<T> | undefined,
                                ignoreCase: boolean = false): T => {
    const newOptions = new objectType();
    const keys = options instanceof Map ? Array.from(options.keys()) : Object.keys(options ?? {});
    if(keys?.length) {
        const existingKeys = Object.keys(newOptions);
        keys.forEach(key => {
            const existingKey = existingKeys.find(k => {
                if(ignoreCase) {
                    return k.toLowerCase() === key.toLowerCase();
                } else {
                    return k === key;
                }
            });

            if(existingKey) {
                newOptions[existingKey] = options instanceof Map ? options.get(key) : options[key];
            }
        });
    }

    return newOptions;
};
