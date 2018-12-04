"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const BYTE_BITS = 8;
exports.BYTE_POSSIBILITIES = 1 << BYTE_BITS;
function choose(n, k) {
    let product = 1n;
    for (let i = n; i > k; i--)
        product *= BigInt(i);
    for (let i = n - k; i > 1; i--)
        product /= BigInt(i);
    return product;
}
exports.choose = choose;
function compare(buffer1, buffer2) {
    const lengthDiff = buffer1.byteLength - buffer2.byteLength;
    if (lengthDiff)
        return lengthDiff;
    const array1 = new Uint8Array(buffer1), array2 = new Uint8Array(buffer2);
    const { length } = array1;
    for (let i = 0; i < length; i++) {
        const diff = array1[i] - array2[i];
        if (diff)
            return diff;
    }
    return 0;
}
exports.compare = compare;
