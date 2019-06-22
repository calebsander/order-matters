export interface LookupResult {
	index: number
	newArray: HoleyArray
}
// Represents an array where some indices have become "holes".
// Maps between indices in the full array and
// indices in the array with holes removed.
export interface HoleyArray {
	readonly spaces: number
	// A forward lookup retrieves the full index of the given space.
	// A reverse lookup retrieves the index of the space at the given full index.
	// Replaces the space with a hole.
	lookup(lookupIndex: number, reverse: boolean): LookupResult
}

interface InternalLookupResult {
	index: number
	newNodes: Node[]
}
abstract class Node implements HoleyArray {
	// The total number of indices in this subarray
	abstract readonly length: number
	// The total number of open indices (non-holes) in this subarray
	abstract readonly spaces: number

	// Performs a lookup, which may split this node into 1 or more
	abstract internalLookup(lookupIndex: number, reverse: boolean): InternalLookupResult
	// Performs a lookup at the root of the tree
	lookup(lookupIndex: number, reverse: boolean): LookupResult {
		const {index, newNodes} = this.internalLookup(lookupIndex, reverse)
		let newArray: Node
		if (newNodes.length > 1) newArray = new InnerNode(newNodes)
		else { // node was not split
			[newArray] = newNodes
			if (newArray instanceof InnerNode) {
				const {children} = newArray
				if (children.length === 1) {
					// Root inner node has only 1 child, so replace it with its child
					[newArray] = children
				}
			}
		}
		return {index, newArray}
	}
}

// A leaf node that contains only open indices
class SpacesNode extends Node {
	constructor(public length: number) { super() }

	get spaces() { return this.length }

	internalLookup(index: number) {
		const newNodes: Node[] = []
		if (index) newNodes.push(new SpacesNode(index))
		newNodes.push(new HolesNode(1))
		const rightLength = this.length - 1 - index
		if (rightLength) newNodes.push(new SpacesNode(rightLength))
		return {index, newNodes}
	}
}
// A leaf node that contains only holes
class HolesNode extends Node {
	constructor(public length: number) { super() }

	get spaces() { return 0 }

	// There aren't any open indices to look up
	internalLookup(): never {
		throw new Error('Cannot perform lookup in HolesNode')
	}
}

// Tries to combine two leaves of the same type
function tryLeafCombine(node1: Node, node2: Node, combineLeft: boolean) {
	if (
		node1 instanceof SpacesNode && node2 instanceof SpacesNode ||
		node1 instanceof HolesNode && node2 instanceof HolesNode
	) {
		if (combineLeft) node1.length += node2.length
		else node2.length += node1.length
		return true
	}
	return false
}

// The maximum number of children in an inner node
const MAX_CHILDREN = 16

class InnerNode extends Node {
	length: number
	spaces: number

	constructor(readonly children: Node[]) {
		super()
		let length = 0, spaces = 0
		for (const child of children) {
			length += child.length
			spaces += child.spaces
		}
		this.length = length
		this.spaces = spaces
	}

	internalLookup(lookupIndex: number, reverse: boolean) {
		const {children} = this
		// Find the child containing the given index
		let i = 0, child: Node
		let skippedIndices = 0
		while (true) {
			child = children[i]
			const {length, spaces} = child
			// Forward lookup is into the spaces; reverse is into the full array
			const accessibleIndices = reverse ? length : spaces
			const newLookupIndex = lookupIndex - accessibleIndices
			if (newLookupIndex < 0) break

			skippedIndices += reverse ? spaces : length
			lookupIndex = newLookupIndex
			i++
		}

		// Look up the index within the child
		const {index, newNodes} = child.internalLookup(lookupIndex, reverse)
		const resultIndex = skippedIndices + index

		// Replace the child with newNodes and try to combine consecutive nodes
		const previous = children[i - 1] as Node | undefined
		if (previous) { // combine to the left
			const [firstNew] = newNodes
			if (tryLeafCombine(previous, firstNew, true)) newNodes.shift()
			else if (
				previous instanceof InnerNode && firstNew instanceof InnerNode &&
				previous.children.length + firstNew.children.length < MAX_CHILDREN
			) {
				const leftChildren = previous.children,
				      rightChildren = firstNew.children
				const [lastLeft] = leftChildren.slice(-1)
				if (tryLeafCombine(lastLeft, rightChildren[0], false)) {
					leftChildren.pop()
				}
				leftChildren.push(...rightChildren)
				;(previous as InnerNode).length += firstNew.length
				;(previous as InnerNode).spaces += firstNew.spaces
				newNodes.shift()
			}
		}
		const next = children[i + 1] as Node | undefined
		let removeNext = false
		if (next) { // combine to the right
			let [lastNew] = newNodes.slice(-1) as [Node] | []
			if (!lastNew) lastNew = previous!
			if (tryLeafCombine(lastNew, next, !newNodes.length)) {
				if (!newNodes.pop()) removeNext = true
			}
			else if (
				lastNew instanceof InnerNode && next instanceof InnerNode &&
				lastNew.children.length + next.children.length < MAX_CHILDREN
			) {
				const leftChildren = lastNew.children,
				      rightChildren = next.children
				const [lastLeft] = leftChildren.slice(-1)
				if (tryLeafCombine(lastLeft, rightChildren[0], false)) {
					leftChildren.pop()
				}
				rightChildren.unshift(...leftChildren)
				;(next as InnerNode).length += lastNew.length
				;(next as InnerNode).spaces += lastNew.spaces
				if (!newNodes.pop()) removeNext = true
			}
		}
		children.splice(i, 1 + Number(removeNext), ...newNodes)
		this.spaces-- // one more space has been converted to a hole
		const newInnerNodes: Node[] = [this]
		if (children.length > MAX_CHILDREN) {
			// Inner node has become too large, so split off the right half
			const rightChildren = children.splice(children.length >> 1)
			const rightNode = new InnerNode(rightChildren)
			this.length -= rightNode.length
			this.spaces -= rightNode.spaces
			newInnerNodes.push(rightNode)
		}
		return {index: resultIndex, newNodes: newInnerNodes}
	}
}

export const makeHoleyArray = (length: number): HoleyArray =>
	new SpacesNode(length)