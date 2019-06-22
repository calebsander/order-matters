import {makeHoleyArray} from './holey-array'
import {BYTE_POSSIBILITIES, choose, compare} from './util'

export interface ReadableBuffer {
	readBytes(length: number): ArrayBufferLike
	addUnorderedSet(chunks: ArrayBufferLike[]): void
}

abstract class BufferReader {
	private readPosition = 0

	constructor(private readonly buffer: ArrayBufferLike) {}

	readBytes(length: number): ArrayBufferLike {
		const {readPosition} = this
		const newReadPosition = readPosition + length
		if (newReadPosition > this.buffer.byteLength) {
			throw new Error(
				`Out of bounds: tried to read ${length} bytes ` +
				`at ${readPosition} in buffer of length ${this.buffer.byteLength}`
			)
		}
		this.readPosition = newReadPosition
		return this.buffer.slice(readPosition, newReadPosition)
	}
}

export class ReorderingReader extends BufferReader implements ReadableBuffer {
	private possibilities = 1n
	private groupValues = new Set<GroupValue>() // TODO: use a circular buffer queue instead

	readBytes(length: number) {
		const encodedBytes: number[] = []
		let encodedByteCount = 0
		while (encodedByteCount < length && this.possibilities >= BYTE_POSSIBILITIES) {
			let byte = 0
			for (let possibilities = 1; possibilities < BYTE_POSSIBILITIES;) {
				const [group] = this.groupValues
				const groupPossibilities = group.possibilities
				const remainingPossibilities = Math.ceil(BYTE_POSSIBILITIES / possibilities)
				const possibilitiesToUse = groupPossibilities < remainingPossibilities
					? Number(groupPossibilities)
					: remainingPossibilities
				const bigPossibilitiesToUse = BigInt(possibilitiesToUse)
				byte += possibilities * Number(group.value % bigPossibilitiesToUse)
				const newGroupPossibilities = groupPossibilities / bigPossibilitiesToUse
				if (newGroupPossibilities > 1) {
					group.possibilities = newGroupPossibilities
					group.value /= bigPossibilitiesToUse
				}
				else this.groupValues.delete(group)
				possibilities *= possibilitiesToUse
				this.possibilities = this.possibilities / groupPossibilities * newGroupPossibilities
			}
			encodedBytes[encodedByteCount++] = byte
		}
		const chunk = new Uint8Array(length)
		if (encodedByteCount) chunk.set(encodedBytes)
		const unencodedByteCount = length - encodedByteCount
		if (unencodedByteCount) {
			chunk.set(new Uint8Array(super.readBytes(unencodedByteCount)), encodedByteCount)
		}
		return chunk.buffer
	}
	addUnorderedSet(chunks: ArrayBufferLike[]) {
		const {length} = chunks
		if (!length) return // avoid adding a set with 0 groups

		const sortedChunks = chunks
			.map((chunk, index) => ({chunk, index}))
			.sort((a, b) => compare(a.chunk, b.chunk) || a.index - b.index)
		let holeyArray = makeHoleyArray(length)
		const addGroup = (indices: number[]) => {
			const elements = indices.length
			const contiguousIndices = new Array<number>(elements)
			const remainingElements = holeyArray.spaces
			for (let i = 0; i < elements; i++) {
				let index: number
				({index, newArray: holeyArray} = holeyArray.lookup(indices[i], true))
				contiguousIndices[i] = index + i
			}
			const possibilities = choose(remainingElements, elements)
			this.groupValues.add({
				possibilities,
				value: decode(remainingElements, contiguousIndices)
			})
			this.possibilities *= possibilities
		}
		let chunk: ArrayBufferLike, indices: number[]
		for (let i = 0; i < length; i++) {
			const {chunk: nextChunk, index} = sortedChunks[i]
			if (!i || compare(chunk!, nextChunk)) { // new group
				if (i) addGroup(indices!)
				chunk = nextChunk
				indices = []
			}
			indices!.push(index)
		}
		addGroup(indices!)
	}
}

export function decode(length: number, indices: number[]) {
	let value = 0n
	let possibleIndex = 0
	let remainingIndices = indices.length
	for (const index of indices) {
		remainingIndices--
		while (possibleIndex++ < index) {
			value += choose(length - possibleIndex, remainingIndices)
		}
	}
	return value
}

interface GroupValue {
	possibilities: bigint
	value: bigint
}