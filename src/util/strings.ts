export interface PadNumberOptions {
    char?: string;
    direction?: 'left' | 'right';
    fractionDigits?: number;
    hideEmpties?: boolean;
}

export const padNumber = (value: number, paddingAmount: number, options?: PadNumberOptions): string => {
    if(!options) {
        options = {};
    }

    let { char, direction, fractionDigits, hideEmpties } = options;
    if(char === undefined) {
        char = ' ';
    }
    if(!direction || (direction !== 'left' && direction !== 'right')) {
        direction = 'left';
    }
    if(fractionDigits === undefined) {
        fractionDigits = 0;
    }
    if(hideEmpties === undefined) {
        hideEmpties = false;
    }

    if(value === 0 && hideEmpties) {
        return new Array(paddingAmount).fill(char).join('');
    }

    let stringified = `${value}`;
    const parts = stringified.split('.');
    if(!parts?.length) {
        return 'NaN';
    }

    let wholeNumber = parts[0];
    const wholeNumberDelta = paddingAmount - wholeNumber.length;

    if(wholeNumberDelta > 0) {
        const fill = new Array(wholeNumberDelta).fill(char).join('');
        if(direction === 'left') {
            wholeNumber = fill + wholeNumber;
        } else {
            wholeNumber += fill;
        }
    }

    if(fractionDigits === 0) {
        return wholeNumber;
    }

    if(parts.length !== 2) {
        parts.push('');
    }

    let fractional = parts[1];
    const fractionalDelta = fractionDigits - fractional.length;

    if(fractionalDelta > 0) {
        fractional += new Array(fractionalDelta).fill('0');
    }

    return `${wholeNumber}.${fractional}`;
};
