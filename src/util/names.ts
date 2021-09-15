export const nameSorter = (name1, name2) => {
    if(/^\d*$/.test(name1) && /^\d*$/.test(name2)) {
        return Number(name1) - Number(name2);
    } else {
        if(/^\d*$/.test(name1)) {
            return -1;
        } else if(/^\d*$/.test(name2)) {
            return 1;
        }
    }

    return 0;
};
