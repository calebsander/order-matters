import {HoleyArray, makeHoleyArray} from './holey-array'

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
	private readonly sets = new Set<UnorderedSet>()

	writeUnordered(chunks: ArrayBuffer[]) {
		const {length} = chunks
		chunks.sort(compare)
		const groupStarts: number[] = []
		let groupStart = 0
		for (let i = 1; i < length; i++) {
			if (compare(chunks[groupStart], chunks[i])) { // new group
				groupStarts.push(groupStart)
				groupStart = i
			}
		}
		groupStarts.push(groupStart)
		const equalGroups = new Set<EqualGroup>()
		let remainingLength = length
		for (let i = 0; i < groupStarts.length; i++) {
			const groupStart = groupStarts[i]
			const elements = (groupStarts[i + 1] || length) - groupStart
			const possibilities = choose(remainingLength, elements)
			equalGroups.add({
				elements,
				possibilities,
				bytes: chunks[groupStart]
			})
			this.possibilities *= possibilities
			remainingLength -= elements
		}
		this.sets.add({
			startIndex: this.chunks.length,
			openIndices: makeHoleyArray(length),
			equalGroups
		})
		this.chunks.length += length
	}
	writeBytes(bytes: ArrayBuffer) {
		let orderBytes = 0 // number of bytes which can be written by reordering unordered sets
		for (
			let possibilities = this.possibilities;
			possibilities & ~0xFFn && orderBytes < bytes.byteLength;
			orderBytes++, possibilities >>= 8n
		);
		const bytesArray = new Uint8Array(bytes)
		let valueToEncode = 0n
		for (let i = 0; i < orderBytes; i++) valueToEncode = valueToEncode << 8n | BigInt(bytesArray[i])
		const reachedBytesMask = -1n << (BigInt(orderBytes) << 3n)
		let reachedPossibilities = 1n
		for (const set of this.sets) {
			let {startIndex, equalGroups, openIndices} = set
			for (const group of equalGroups) {
				const {elements, bytes, possibilities} = group
				const value = valueToEncode % possibilities
				valueToEncode = valueToEncode / possibilities
				const indices = encode(openIndices.length, elements, Number(value))
				for (let i = 0; i < indices.length; i++) {
					let index: number
					({index, newArray: openIndices} = openIndices.lookup(indices[i] - i))
					this.chunks[startIndex + index] = bytes
				}
				equalGroups.delete(group)
				this.possibilities /= possibilities
				reachedPossibilities *= possibilities
				if (reachedPossibilities & reachedBytesMask) break
			}
			if (equalGroups.size) set.openIndices = openIndices
			else this.sets.delete(set)
			if (reachedPossibilities & reachedBytesMask) break
		}
		if (orderBytes < bytes.byteLength) this.chunks.push(bytes.slice(orderBytes))
	}
	toBuffer() {
		for (const set of this.sets) {
			let {startIndex, equalGroups, openIndices} = set
			for (let {elements, bytes} of equalGroups) {
				while (elements--) {
					let index: number
					({index, newArray: openIndices} = openIndices.lookup(0))
					this.chunks[startIndex + index] = bytes
				}
			}
		}
		this.sets.clear()
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
export function encode(length: number, elements: number, value: number) {
	const indices: number[] = []
	for (let i = 0, start = 0, remainingElements = elements - 1; i < elements; i++, remainingElements--) {
		for (let possibilities = 0; ; start++) {
			const newPossibilities = possibilities + Number(choose(length - start - 1, remainingElements))
			if (newPossibilities > value) {
				value -= possibilities
				break
			}
			else possibilities = newPossibilities
		}
		indices.push(start++)
	}
	return indices
}

interface EqualGroup {
	elements: number
	possibilities: bigint // choose(remainingLength, elements)
	bytes: ArrayBuffer
}
interface UnorderedSet {
	startIndex: number
	openIndices: HoleyArray
	equalGroups: Set<EqualGroup>
}