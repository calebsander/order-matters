"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class HolelessSegment {
    constructor(length, reverse) {
        this.length = length;
        this.reverse = reverse;
    }
    lookup(index) {
        return {
            index,
            newArray: new SplitSegment(index, new HolelessSegment(index, this.reverse), new HolelessSegment(this.length - 1 - index, this.reverse), this.reverse)
        };
    }
    get totalHoles() { return 0; }
}
class SplitSegment {
    constructor(splitIndex, left, right, reverse) {
        this.splitIndex = splitIndex;
        this.left = left;
        this.right = right;
        this.reverse = reverse;
        this.length = this.left.length + this.right.length;
        this.totalHoles = reverse
            ? 0
            : this.left.totalHoles + 1 + this.right.totalHoles;
    }
    lookup(lookupIndex) {
        const splitRelativeIndex = lookupIndex - this.splitIndex;
        if (splitRelativeIndex < 0) {
            const { index, newArray } = this.left.lookup(lookupIndex);
            return {
                index,
                newArray: new SplitSegment(this.splitIndex - (this.reverse ? 0 : 1), newArray, this.right, this.reverse)
            };
        }
        else {
            const { index, newArray } = this.right.lookup(splitRelativeIndex);
            const skipIndices = this.reverse
                ? this.left.length - 1
                : this.left.totalHoles + this.splitIndex + 1;
            return {
                index: skipIndices + index,
                newArray: new SplitSegment(this.splitIndex, this.left, newArray, this.reverse)
            };
        }
    }
}
exports.makeHoleyArray = (length, reverse) => new HolelessSegment(length, reverse);
