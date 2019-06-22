"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const holey_array_1 = require("./holey-array");
const util_1 = require("./util");
class BufferReader {
    constructor(buffer) {
        this.buffer = buffer;
        this.readPosition = 0;
    }
    readBytes(length) {
        const { readPosition } = this;
        const newReadPosition = readPosition + length;
        if (newReadPosition > this.buffer.byteLength) {
            throw new Error(`Out of bounds: tried to read ${length} bytes ` +
                `at ${readPosition} in buffer of length ${this.buffer.byteLength}`);
        }
        this.readPosition = newReadPosition;
        return this.buffer.slice(readPosition, newReadPosition);
    }
}
class ReorderingReader extends BufferReader {
    constructor() {
        super(...arguments);
        this.possibilities = 1n;
        this.groupValues = new Set(); // TODO: use a circular buffer queue instead
    }
    readBytes(length) {
        const encodedBytes = [];
        let encodedByteCount = 0;
        while (encodedByteCount < length && this.possibilities >= util_1.BYTE_POSSIBILITIES) {
            let byte = 0;
            for (let possibilities = 1; possibilities < util_1.BYTE_POSSIBILITIES;) {
                const [group] = this.groupValues;
                const groupPossibilities = group.possibilities;
                const remainingPossibilities = Math.ceil(util_1.BYTE_POSSIBILITIES / possibilities);
                const possibilitiesToUse = groupPossibilities < remainingPossibilities
                    ? Number(groupPossibilities)
                    : remainingPossibilities;
                const bigPossibilitiesToUse = BigInt(possibilitiesToUse);
                byte += possibilities * Number(group.value % bigPossibilitiesToUse);
                const newGroupPossibilities = groupPossibilities / bigPossibilitiesToUse;
                if (newGroupPossibilities > 1) {
                    group.possibilities = newGroupPossibilities;
                    group.value /= bigPossibilitiesToUse;
                }
                else
                    this.groupValues.delete(group);
                possibilities *= possibilitiesToUse;
                this.possibilities = this.possibilities / groupPossibilities * newGroupPossibilities;
            }
            encodedBytes[encodedByteCount++] = byte;
        }
        const chunk = new Uint8Array(length);
        if (encodedByteCount)
            chunk.set(encodedBytes);
        const unencodedByteCount = length - encodedByteCount;
        if (unencodedByteCount) {
            chunk.set(new Uint8Array(super.readBytes(unencodedByteCount)), encodedByteCount);
        }
        return chunk.buffer;
    }
    addUnorderedSet(chunks) {
        const { length } = chunks;
        if (!length)
            return; // avoid adding a set with 0 groups
        const sortedChunks = chunks
            .map((chunk, index) => ({ chunk, index }))
            .sort((a, b) => util_1.compare(a.chunk, b.chunk) || a.index - b.index);
        let holeyArray = holey_array_1.makeHoleyArray(length);
        const addGroup = (indices) => {
            const elements = indices.length;
            const contiguousIndices = new Array(elements);
            const remainingElements = holeyArray.spaces;
            for (let i = 0; i < elements; i++) {
                let index;
                ({ index, newArray: holeyArray } = holeyArray.lookup(indices[i], true));
                contiguousIndices[i] = index + i;
            }
            const possibilities = util_1.choose(remainingElements, elements);
            this.groupValues.add({
                possibilities,
                value: decode(remainingElements, contiguousIndices)
            });
            this.possibilities *= possibilities;
        };
        let chunk, indices;
        for (let i = 0; i < length; i++) {
            const { chunk: nextChunk, index } = sortedChunks[i];
            if (!i || util_1.compare(chunk, nextChunk)) { // new group
                if (i)
                    addGroup(indices);
                chunk = nextChunk;
                indices = [];
            }
            indices.push(index);
        }
        addGroup(indices);
    }
}
exports.ReorderingReader = ReorderingReader;
function decode(length, indices) {
    let value = 0n;
    let possibleIndex = 0;
    let remainingIndices = indices.length;
    for (const index of indices) {
        remainingIndices--;
        while (possibleIndex++ < index) {
            value += util_1.choose(length - possibleIndex, remainingIndices);
        }
    }
    return value;
}
exports.decode = decode;
