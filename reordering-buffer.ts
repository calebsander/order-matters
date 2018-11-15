import {HoleyArray, makeHoleyArray} from './holey-array'
import {choose} from './util'

const BYTE_BITS = 8
const BYTE_POSSIBILITIES = 1 << BYTE_BITS
const EMPTY = new ArrayBuffer(0)

export interface WritableBuffer {
	writeBytes(bytes: ArrayBufferLike): void
	writeUnordered(chunks: ArrayBufferLike[]): void
	toBuffer(): ArrayBufferLike
}

abstract class ChunkedBuffer {
	protected readonly chunks: ArrayBufferLike[] = []

	writeBytes(bytes: ArrayBufferLike) {
		this.writeUnordered([bytes])
	}
	abstract writeUnordered(chunks: ArrayBufferLike[]): void
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
	writeUnordered(chunks: ArrayBufferLike[]) {
		for (const chunk of chunks) this.chunks.push(chunk)
	}
}

export class ReorderingBuffer extends ChunkedBuffer implements WritableBuffer {
	private possibilities = 1n
	private sets: UnorderedSet[] = []
	private currentSet = 0
	private currentGroup = 0

	writeUnordered(chunks: ArrayBufferLike[]) {
		if (!chunks.length) return // avoid adding a set with 0 equalGroups

		const {length} = chunks
		chunks.sort(compare)
		const groups: EqualChunks[] = []
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
		let newPossibilities = 1n
		for (let i = 0; i < groups.length; i++) {
			const {start, bytes} = groups[i]
			const nextGroup = groups[i + 1] as EqualChunks | undefined
			const elements = (nextGroup ? nextGroup.start : length) - start
			const possibilities = choose(remainingLength, elements)
			equalGroups.push({
				elements,
				remainingPossibilities: possibilities,
				bytes,
				value: 0n,
				usedPossibilities: 1n
			})
			newPossibilities *= possibilities
			remainingLength -= elements
		}
		let bytesToEncode = 0
		const encodeSources: EncodeSource[] = []
		encodeBytes: for (const chunk of chunks) {
			const {byteLength} = chunk
			for (let byte = 0; byte < byteLength; byte++, bytesToEncode++) {
				if (this.possibilities < BYTE_POSSIBILITIES) break encodeBytes
				for (let possibilities = 1; possibilities < BYTE_POSSIBILITIES;) {
					const {equalGroups} = this.sets[this.currentSet]
					const group = equalGroups[this.currentGroup]
					const {usedPossibilities, remainingPossibilities: groupPossibilities} = group
					const remainingPossibilities = Math.ceil(BYTE_POSSIBILITIES / possibilities)
					const possibilitiesToUse = groupPossibilities < remainingPossibilities
						? Number(groupPossibilities)
						: remainingPossibilities
					const bigPossibilitiesToUse = BigInt(possibilitiesToUse)
					group.usedPossibilities = usedPossibilities * bigPossibilitiesToUse
					const newGroupPossibilities = group.remainingPossibilities = groupPossibilities / bigPossibilitiesToUse
					if (newGroupPossibilities < 2) { // all group's possibilities have been used up
						if (this.currentGroup + 1 < equalGroups.length) this.currentGroup++
						else {
							this.currentSet++
							this.currentGroup = 0
						}
					}
					possibilities *= possibilitiesToUse
					this.possibilities = this.possibilities / groupPossibilities * newGroupPossibilities
					encodeSources.push({
						group,
						preUsedPossibilities: usedPossibilities,
						possibilitiesToUse
					})
				}
			}
		}
		this.possibilities *= newPossibilities
		this.sets.push({
			startIndex: this.chunks.length,
			length,
			equalGroups,
			bytesToEncode,
			encodeSources
		})
		this.chunks.length += length
	}
	toBuffer() {
		// Must order later sets first since their ordering determines which bytes
		// to encode into earlier sets
		for (let set = this.sets.length - 1; set >= 0; set--) {
			const {
				startIndex,
				length,
				equalGroups,
				bytesToEncode,
				encodeSources
			} = this.sets[set]
			// Reorder set based on values of each group
			let openIndices = makeHoleyArray(length)
			for (const {elements, bytes, value} of equalGroups) {
				const indices = encode(openIndices.length, elements, value)
				for (let i = 0; i < elements; i++) {
					let index: number
					({index, newArray: openIndices} = openIndices.lookup(indices[i] - i))
					this.chunks[startIndex + index] = bytes
				}
			}
			// Encode leading bytes' values into previous sets
			if (bytesToEncode) {
				let encodeIndex = 0
				let currentChunk = startIndex, chunkByte = 0
				for (let byte = 0; byte < bytesToEncode; byte++) {
					while (chunkByte === this.chunks[currentChunk].byteLength) {
						this.chunks[currentChunk++] = EMPTY
						chunkByte = 0
					}
					let byteValue = new Uint8Array(this.chunks[currentChunk])[chunkByte++]
					for (let possibilities = 1; possibilities < BYTE_POSSIBILITIES;) {
						const {group, preUsedPossibilities, possibilitiesToUse} = encodeSources[encodeIndex++]
						group.value += preUsedPossibilities * BigInt(byteValue % possibilitiesToUse)
						byteValue = (byteValue / possibilitiesToUse) | 0
						possibilities *= possibilitiesToUse
					}
				}
				this.chunks[currentChunk] = this.chunks[currentChunk].slice(chunkByte)
			}
		}
		return super.toBuffer()
	}
}

export function compare(buffer1: ArrayBufferLike, buffer2: ArrayBufferLike) {
	const lengthDiff = buffer1.byteLength - buffer2.byteLength
	if (lengthDiff) return lengthDiff

	const array1 = new Uint8Array(buffer1),
	      array2 = new Uint8Array(buffer2)
	const {length} = array1
	for (let i = 0; i < length; i++) {
		const diff = array1[i] - array2[i]
		if (diff) return diff
	}
	return 0
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

interface EqualChunks {
	start: number
	bytes: ArrayBufferLike
}
interface EqualGroup {
	readonly elements: number
	readonly bytes: ArrayBufferLike
	remainingPossibilities: bigint // initially choose(remainingLength, elements)
	value: bigint
	usedPossibilities: bigint
}
interface EncodeSource {
	group: EqualGroup
	preUsedPossibilities: bigint
	possibilitiesToUse: number
}
interface UnorderedSet {
	startIndex: number
	length: number
	equalGroups: EqualGroup[]
	bytesToEncode: number
	encodeSources: EncodeSource[]
}