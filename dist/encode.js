"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const holey_array_1 = require("./holey-array");
const util_1 = require("./util");
const EMPTY = new ArrayBuffer(0);
class ChunkedBuffer {
    constructor() {
        this.chunks = [];
    }
    writeBytes(bytes) {
        this.writeUnordered([bytes]);
    }
    toBuffer() {
        let length = 0;
        for (const chunk of this.chunks)
            length += chunk.byteLength;
        const buffer = new Uint8Array(length);
        length = 0;
        for (const chunk of this.chunks) {
            buffer.set(new Uint8Array(chunk), length);
            length += chunk.byteLength;
        }
        return buffer.buffer;
    }
}
class ReorderingBuffer extends ChunkedBuffer {
    constructor() {
        super(...arguments);
        this.possibilities = 1n;
        this.sets = [];
        this.currentSet = 0;
        this.currentGroup = 0;
    }
    writeUnordered(chunks) {
        const { length } = chunks;
        if (!length)
            return; // avoid adding a set with 0 equalGroups
        chunks.sort(util_1.compare);
        const groups = [];
        let start = 0, [startChunk] = chunks;
        for (let i = 1; i < length; i++) {
            const chunk = chunks[i];
            if (util_1.compare(startChunk, chunk)) { // new group
                groups.push({ start, bytes: startChunk });
                start = i;
                startChunk = chunk;
            }
        }
        groups.push({ start, bytes: startChunk });
        const equalGroups = [];
        let remainingLength = length;
        let newPossibilities = 1n;
        for (let i = 0; i < groups.length; i++) {
            const { start, bytes } = groups[i];
            const nextGroup = groups[i + 1];
            const elements = (nextGroup ? nextGroup.start : length) - start;
            const possibilities = util_1.choose(remainingLength, elements);
            equalGroups.push({
                elements,
                remainingPossibilities: possibilities,
                bytes,
                value: 0n,
                usedPossibilities: 1n
            });
            newPossibilities *= possibilities;
            remainingLength -= elements;
        }
        let bytesToEncode = 0;
        const encodeSources = [];
        encodeBytes: for (const chunk of chunks) {
            const { byteLength } = chunk;
            for (let byte = 0; byte < byteLength; byte++, bytesToEncode++) {
                if (this.possibilities < util_1.BYTE_POSSIBILITIES)
                    break encodeBytes;
                for (let possibilities = 1; possibilities < util_1.BYTE_POSSIBILITIES;) {
                    const { equalGroups } = this.sets[this.currentSet];
                    const group = equalGroups[this.currentGroup];
                    const { usedPossibilities, remainingPossibilities: groupPossibilities } = group;
                    const remainingPossibilities = Math.ceil(util_1.BYTE_POSSIBILITIES / possibilities);
                    const possibilitiesToUse = groupPossibilities < remainingPossibilities
                        ? Number(groupPossibilities)
                        : remainingPossibilities;
                    const bigPossibilitiesToUse = BigInt(possibilitiesToUse);
                    group.usedPossibilities = usedPossibilities * bigPossibilitiesToUse;
                    const newGroupPossibilities = group.remainingPossibilities = groupPossibilities / bigPossibilitiesToUse;
                    if (newGroupPossibilities < 2) { // all group's possibilities have been used up
                        if (this.currentGroup + 1 < equalGroups.length)
                            this.currentGroup++;
                        else {
                            this.currentSet++;
                            this.currentGroup = 0;
                        }
                    }
                    possibilities *= possibilitiesToUse;
                    this.possibilities = this.possibilities / groupPossibilities * newGroupPossibilities;
                    encodeSources.push({
                        group,
                        preUsedPossibilities: usedPossibilities,
                        possibilitiesToUse
                    });
                }
            }
        }
        this.possibilities *= newPossibilities;
        this.sets.push({
            startIndex: this.chunks.length,
            length,
            equalGroups,
            bytesToEncode,
            encodeSources
        });
        this.chunks.length += length;
    }
    toBuffer() {
        // Must order later sets first since their ordering determines which bytes
        // to encode into earlier sets
        for (let set = this.sets.length - 1; set >= 0; set--) {
            const { startIndex, length, equalGroups, bytesToEncode, encodeSources } = this.sets[set];
            // Reorder set based on values of each group
            let openIndices = holey_array_1.makeHoleyArray(length, false);
            for (const { elements, bytes, value } of equalGroups) {
                const indices = encode(openIndices.length, elements, value);
                for (let i = 0; i < elements; i++) {
                    let index;
                    ({ index, newArray: openIndices } = openIndices.lookup(indices[i] - i));
                    this.chunks[startIndex + index] = bytes;
                }
            }
            // Encode leading bytes' values into previous sets
            if (bytesToEncode) {
                let encodeIndex = 0;
                let currentChunk = startIndex, chunkByte = 0;
                for (let byte = 0; byte < bytesToEncode; byte++) {
                    while (chunkByte === this.chunks[currentChunk].byteLength) {
                        this.chunks[currentChunk++] = EMPTY;
                        chunkByte = 0;
                    }
                    let byteValue = new Uint8Array(this.chunks[currentChunk])[chunkByte++];
                    for (let possibilities = 1; possibilities < util_1.BYTE_POSSIBILITIES;) {
                        const { group, preUsedPossibilities, possibilitiesToUse } = encodeSources[encodeIndex++];
                        group.value += preUsedPossibilities * BigInt(byteValue % possibilitiesToUse);
                        byteValue = (byteValue / possibilitiesToUse) | 0;
                        possibilities *= possibilitiesToUse;
                    }
                }
                this.chunks[currentChunk] = this.chunks[currentChunk].slice(chunkByte);
            }
        }
        return super.toBuffer();
    }
}
exports.ReorderingBuffer = ReorderingBuffer;
function encode(length, elements, value) {
    const lengthMinus1 = length - 1;
    const indices = new Array(elements);
    for (let i = 0, start = 0, remainingElements = elements - 1; i < elements; i++, remainingElements--) {
        for (let possibilities = 0n;; start++) {
            const newPossibilities = possibilities + util_1.choose(lengthMinus1 - start, remainingElements);
            if (newPossibilities > value) {
                value -= possibilities;
                break;
            }
            else
                possibilities = newPossibilities;
        }
        indices[i] = start++;
    }
    return indices;
}
exports.encode = encode;
