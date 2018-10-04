import {makeHoleyArray} from './holey-array'

const BYTE_BITS = 8
const BYTE_POSSIBILITIES = 1 << BYTE_BITS
const BIG_BYTE_BITS = BigInt(BYTE_BITS)

export interface WritableBuffer {
	writeBytes(bytes: ArrayBuffer): void
	writeUnordered(chunks: ArrayBuffer[]): void
	toBuffer(): ArrayBuffer
}

class ChunkedBuffer {
	protected readonly chunks: ArrayBuffer[] = []

	toBuffer() {
		let length = 0
		for (const chunk of this.chunks) length += chunk.byteLength
		const buffer = new Uint8Array(length)
		length = 0
		for (const chunk of this.chunks) {
			buffer.set(new Uint8Array(chunk), length)
			length += chunk.byteLength
		}
		return buffer.buffer
	}
}

export class NoReorderingBuffer extends ChunkedBuffer implements WritableBuffer {
	writeBytes(bytes: ArrayBuffer) {
		this.chunks.push(bytes)
	}
	writeUnordered(chunks: ArrayBuffer[]) {
		for (const chunk of chunks) this.writeBytes(chunk)
	}
}

export class ReorderingBuffer extends ChunkedBuffer implements WritableBuffer {
	private possibilities = 1n
	private sets: UnorderedSet[] = []
	private currentSet = 0
	private currentGroup = 0

	writeUnordered(chunks: ArrayBuffer[]) {
		if (!chunks.length) return // avoid adding a set with 0 equalGroups

		const {length} = chunks
		chunks.sort(compare)
		const groups: {start: number, bytes: ArrayBuffer}[] = []
		let start = 0, [startChunk] = chunks
		for (let i = 1; i < length; i++) {
			const chunk = chunks[i]
			if (compare(startChunk, chunk)) { // new group
				groups.push({start, bytes: startChunk})
				start = i
				startChunk = chunk
			}
		}
		groups.push({start, bytes: startChunk})
		const equalGroups: EqualGroup[] = []
		let remainingLength = length
		for (let i = 0; i < groups.length; i++) {
			const {start, bytes} = groups[i]
			const nextGroup = groups[i + 1]
			const elements = (nextGroup ? nextGroup.start : length) - start
			const possibilities = choose(remainingLength, elements)
			equalGroups.push({
				elements,
				remainingPossibilities: possibilities,
				bytes,
				value: 0n,
				usedPossibilities: 1n
			})
			this.possibilities *= possibilities
			remainingLength -= elements
		}
		this.sets.push({
			startIndex: this.chunks.length,
			length,
			equalGroups
		})
		this.chunks.length += length
	}
	writeBytes(bytes: ArrayBuffer) {
		const {byteLength} = bytes
		const bytesArray = new Uint8Array(bytes)
		let orderBytes = 0 // number of bytes which can be written by reordering unordered sets
		while (orderBytes < byteLength && this.possibilities >> BIG_BYTE_BITS) {
			let byte = bytesArray[orderBytes++]
			for (let possibilities = 1; !(possibilities >> BYTE_BITS);) {
				const {currentSet, currentGroup} = this
				const {equalGroups} = this.sets[currentSet]
				const group = equalGroups[currentGroup]
				const {usedPossibilities} = group
				const groupPossibilities = group.remainingPossibilities
				const remainingPossibilities = Math.ceil(BYTE_POSSIBILITIES / possibilities)
				const possibilitiesToUse = groupPossibilities < remainingPossibilities
					? Number(groupPossibilities)
					: remainingPossibilities
				let {value} = group
				if (value) value *= usedPossibilities
				group.value = value + BigInt(byte % possibilitiesToUse)
				byte = (byte / possibilitiesToUse) | 0
				const bigPossibilitiesToUse = BigInt(possibilitiesToUse)
				group.usedPossibilities = usedPossibilities * bigPossibilitiesToUse
				const newGroupPossibilities = group.remainingPossibilities = groupPossibilities / bigPossibilitiesToUse
				if (newGroupPossibilities < 2) { // all group's possibilities have been used up
					const newGroup = currentGroup + 1
					if (newGroup < equalGroups.length) this.currentGroup = newGroup
					else {
						this.currentSet = currentSet + 1
						this.currentGroup = 0
					}
				}
				possibilities *= possibilitiesToUse
				this.possibilities = this.possibilities / groupPossibilities * newGroupPossibilities
			}
		}
		if (orderBytes < byteLength) this.chunks.push(bytes.slice(orderBytes))
	}
	toBuffer() {
		for (const {startIndex, length, equalGroups} of this.sets) {
			let openIndices = makeHoleyArray(length)
			for (const {elements, bytes, value} of equalGroups) {
				const indices = encode(openIndices.length, elements, value)
				for (let i = 0; i < elements; i++) {
					let index: number
					({index, newArray: openIndices} = openIndices.lookup(indices[i] - i))
					this.chunks[startIndex + index] = bytes
				}
			}
		}
		return super.toBuffer()
	}
}

export function compare(buffer1: ArrayBuffer, buffer2: ArrayBuffer) {
	const lengthDiff = buffer1.byteLength - buffer2.byteLength
	if (lengthDiff) return lengthDiff

	const array1 = new Uint8Array(buffer1),
	      array2 = new Uint8Array(buffer2)
	for (let i = 0; i < array1.length; i++) {
		const diff = array1[i] - array2[i]
		if (diff) return diff
	}
	return 0
}
export function choose(n: number, k: number) {
	let product = 1n
	for (let i = n; i > k; i--) product *= BigInt(i)
	for (let i = n - k; i > 1; i--) product /= BigInt(i)
	return product
}
export function encode(length: number, elements: number, value: bigint) {
	const lengthMinus1 = length - 1
	const indices = new Array<number>(elements)
	for (let i = 0, start = 0, remainingElements = elements - 1; i < elements; i++, remainingElements--) {
		for (let possibilities = 0n; ; start++) {
			const newPossibilities = possibilities + choose(lengthMinus1 - start, remainingElements)
			if (newPossibilities > value) {
				value -= possibilities
				break
			}
			else possibilities = newPossibilities
		}
		indices[i] = start++
	}
	return indices
}

interface EqualGroup {
	readonly elements: number
	readonly bytes: ArrayBuffer
	remainingPossibilities: bigint // initially choose(remainingLength, elements)
	value: bigint
	usedPossibilities: bigint
}
interface UnorderedSet {
	startIndex: number
	length: number
	equalGroups: EqualGroup[]
}