"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class Node {
    // Performs a lookup at the root of the tree
    lookup(lookupIndex, reverse) {
        const { index, newNodes } = this.internalLookup(lookupIndex, reverse);
        let newArray;
        if (newNodes.length > 1)
            newArray = new InnerNode(newNodes);
        else { // node was not split
            [newArray] = newNodes;
            if (newArray instanceof InnerNode) {
                const { children } = newArray;
                if (children.length === 1) {
                    // Root inner node has only 1 child, so replace it with its child
                    [newArray] = children;
                }
            }
        }
        return { index, newArray };
    }
}
// A leaf node that contains only open indices
class SpacesNode extends Node {
    constructor(length) {
        super();
        this.length = length;
    }
    get spaces() { return this.length; }
    internalLookup(index) {
        const newNodes = [];
        if (index)
            newNodes.push(new SpacesNode(index));
        newNodes.push(new HolesNode(1));
        const rightLength = this.length - 1 - index;
        if (rightLength)
            newNodes.push(new SpacesNode(rightLength));
        return { index, newNodes };
    }
}
// A leaf node that contains only holes
class HolesNode extends Node {
    constructor(length) {
        super();
        this.length = length;
    }
    get spaces() { return 0; }
    // There aren't any open indices to look up
    internalLookup() {
        throw new Error('Cannot perform lookup in HolesNode');
    }
}
// Tries to combine two leaves of the same type
function tryLeafCombine(node1, node2, combineLeft) {
    if (node1 instanceof SpacesNode && node2 instanceof SpacesNode ||
        node1 instanceof HolesNode && node2 instanceof HolesNode) {
        if (combineLeft)
            node1.length += node2.length;
        else
            node2.length += node1.length;
        return true;
    }
    return false;
}
// The maximum number of children in an inner node
const MAX_CHILDREN = 16;
class InnerNode extends Node {
    constructor(children) {
        super();
        this.children = children;
        let length = 0, spaces = 0;
        for (const child of children) {
            length += child.length;
            spaces += child.spaces;
        }
        this.length = length;
        this.spaces = spaces;
    }
    internalLookup(lookupIndex, reverse) {
        const { children } = this;
        // Find the child containing the given index
        let i = 0, child;
        let skippedIndices = 0;
        while (true) {
            child = children[i];
            const { length, spaces } = child;
            // Forward lookup is into the spaces; reverse is into the full array
            const accessibleIndices = reverse ? length : spaces;
            const newLookupIndex = lookupIndex - accessibleIndices;
            if (newLookupIndex < 0)
                break;
            skippedIndices += reverse ? spaces : length;
            lookupIndex = newLookupIndex;
            i++;
        }
        // Look up the index within the child
        const { index, newNodes } = child.internalLookup(lookupIndex, reverse);
        const resultIndex = skippedIndices + index;
        // Replace the child with newNodes and try to combine consecutive nodes
        const previous = children[i - 1];
        if (previous) { // combine to the left
            const [firstNew] = newNodes;
            if (tryLeafCombine(previous, firstNew, true))
                newNodes.shift();
            else if (previous instanceof InnerNode && firstNew instanceof InnerNode &&
                previous.children.length + firstNew.children.length < MAX_CHILDREN) {
                const leftChildren = previous.children, rightChildren = firstNew.children;
                const [lastLeft] = leftChildren.slice(-1);
                if (tryLeafCombine(lastLeft, rightChildren[0], false)) {
                    leftChildren.pop();
                }
                leftChildren.push(...rightChildren);
                previous.length += firstNew.length;
                previous.spaces += firstNew.spaces;
                newNodes.shift();
            }
        }
        const next = children[i + 1];
        let removeNext = false;
        if (next) { // combine to the right
            let [lastNew] = newNodes.slice(-1);
            if (!lastNew)
                lastNew = previous;
            if (tryLeafCombine(lastNew, next, !newNodes.length)) {
                if (!newNodes.pop())
                    removeNext = true;
            }
            else if (lastNew instanceof InnerNode && next instanceof InnerNode &&
                lastNew.children.length + next.children.length < MAX_CHILDREN) {
                const leftChildren = lastNew.children, rightChildren = next.children;
                const [lastLeft] = leftChildren.slice(-1);
                if (tryLeafCombine(lastLeft, rightChildren[0], false)) {
                    leftChildren.pop();
                }
                rightChildren.unshift(...leftChildren);
                next.length += lastNew.length;
                next.spaces += lastNew.spaces;
                if (!newNodes.pop())
                    removeNext = true;
            }
        }
        children.splice(i, 1 + Number(removeNext), ...newNodes);
        this.spaces--; // one more space has been converted to a hole
        const newInnerNodes = [this];
        if (children.length > MAX_CHILDREN) {
            // Inner node has become too large, so split off the right half
            const rightChildren = children.splice(children.length >> 1);
            const rightNode = new InnerNode(rightChildren);
            this.length -= rightNode.length;
            this.spaces -= rightNode.spaces;
            newInnerNodes.push(rightNode);
        }
        return { index: resultIndex, newNodes: newInnerNodes };
    }
}
exports.makeHoleyArray = (length) => new SpacesNode(length);
