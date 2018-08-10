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
	private possibilities!: bigint
	private valueToEncode!: bigint
	private reachedBytesMask!: bigint
	private sets!: UnorderedSet[]

	constructor() {
		super()
		this.clearUnordered()
	}

	private clearUnordered() {
		this.possibilities = 1n
		this.valueToEncode = 0n
		this.reachedBytesMask = -1n
		this.sets = []
	}

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
		const equalGroups: EqualGroup[] = []
		let remainingLength = length
		for (let i = 0; i < groupStarts.length; i++) {
			const groupStart = groupStarts[i]
			const elements = (groupStarts[i + 1] || length) - groupStart
			const possibilities = choose(remainingLength, elements)
			equalGroups.push({
				elements,
				possibilities,
				bytes: chunks[groupStart]
			})
			this.possibilities *= possibilities
			remainingLength -= elements
		}
		this.sets.push({
			startIndex: this.chunks.length,
			openIndices: makeHoleyArray(length),
			equalGroups
		})
		this.chunks.length += length
	}
	writeBytes(bytes: ArrayBuffer) {
		const bytesArray = new Uint8Array(bytes)
		let orderBytes = 0 // number of bytes which can be written by reordering unordered sets
		while (orderBytes < bytes.byteLength) {
			const newReachedBytesMask = this.reachedBytesMask << 8n
			if (!(this.possibilities & newReachedBytesMask)) break
			this.valueToEncode = this.valueToEncode << 8n | BigInt(bytesArray[orderBytes++])
			this.reachedBytesMask = newReachedBytesMask
		}
		if (orderBytes < bytes.byteLength) this.chunks.push(bytes.slice(orderBytes))
	}
	toBuffer() {
		let reachedPossibilities = 1n
		for (const set of this.sets) {
			let {startIndex, equalGroups, openIndices} = set
			let groupIndex = 0
			for (; groupIndex < equalGroups.length && !(reachedPossibilities & this.reachedBytesMask); groupIndex++) {
				const {elements, bytes, possibilities} = equalGroups[groupIndex]
				const value = this.valueToEncode % possibilities
				this.valueToEncode /= possibilities
				const indices = encode(openIndices.length, elements, value)
				for (let i = 0; i < indices.length; i++) {
					let index: number
					({index, newArray: openIndices} = openIndices.lookup(indices[i] - i))
					this.chunks[startIndex + index] = bytes
				}
				reachedPossibilities *= possibilities
			}
			for (; groupIndex < equalGroups.length; groupIndex++) { //write out unused elements
				let {elements, bytes} = equalGroups[groupIndex]
				while (elements--) {
					let index: number
					({index, newArray: openIndices} = openIndices.lookup(0))
					this.chunks[startIndex + index] = bytes
				}
			}
		}
		this.clearUnordered()
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
	const indices: number[] = []
	for (let i = 0, start = 0, remainingElements = elements - 1; i < elements; i++, remainingElements--) {
		for (let possibilities = 0n; ; start++) {
			const newPossibilities = possibilities + choose(lengthMinus1 - start, remainingElements)
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
	equalGroups: EqualGroup[]
}