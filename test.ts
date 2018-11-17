import * as assert from 'assert'
import {decode, ReorderingReader} from './decode'
import {makeHoleyArray} from './holey-array'
import {encode, NoReorderingBuffer, ReorderingBuffer} from './encode'
import {choose} from './util'

const TEST_TIMES = 1e5
const MAX_ARRAY_SIZE = 100

const rand = (n: number) => (Math.random() * n) | 0

class MarkedArray {
	private readonly marked: boolean[]

	constructor(public length: number) {
		this.marked = new Array<boolean>(length).fill(false)
	}

	lookup(index: number) {
		for (let i = 0, unmarked = 0; ; i++) {
			if (this.marked[i]) continue
			if (unmarked++ === index) {
				this.marked[i] = true
				return i
			}
		}
	}
}

for (let _ = 0; _ < TEST_TIMES; _++) {
	let length = rand(MAX_ARRAY_SIZE)
	let holeyArray = makeHoleyArray(length, false)
	let reverseHoleyArray = makeHoleyArray(length, true)
	const markedArray = new MarkedArray(length)
	const addIndices: number[] = []
	while (length) {
		const addIndex = rand(length--)
		addIndices.push(addIndex)
		let index: number
		({index, newArray: holeyArray} = holeyArray.lookup(addIndex))
		const markedIndex = markedArray.lookup(addIndex)
		assert.strictEqual(index, markedIndex)
		assert.strictEqual(holeyArray.totalHoles, addIndices.length)
		let reverseIndex: number
		({index: reverseIndex, newArray: reverseHoleyArray} = reverseHoleyArray.lookup(index))
		assert.strictEqual(reverseIndex, addIndex)
	}
}

const CHOOSE_RESULTS = [
	{n: 0, k: 0, result: 1n},
	{n: 1, k: 0, result: 1n},
	{n: 1, k: 1, result: 1n},
	{n: 2, k: 0, result: 1n},
	{n: 2, k: 1, result: 2n},
	{n: 2, k: 2, result: 1n},
	{n: 10, k: 0, result: 1n},
	{n: 10, k: 1, result: 10n},
	{n: 10, k: 2, result: 45n},
	{n: 10, k: 3, result: 120n},
	{n: 10, k: 4, result: 210n},
	{n: 10, k: 5, result: 252n},
	{n: 10, k: 6, result: 210n},
	{n: 10, k: 7, result: 120n},
	{n: 10, k: 8, result: 45n},
	{n: 10, k: 9, result: 10n},
	{n: 10, k: 10, result: 1n}
]
for (const {n, k, result} of CHOOSE_RESULTS) {
	assert.strictEqual(choose(n, k), result, `Expected ${n} choose ${k} to be ${result}, got ${choose(n, k)}`)
}
const n = 20, k = 5
function* results(index = 0, remaining = k): IterableIterator<number[]> {
	if (!remaining) {
		yield []
		return
	}
	for (let i = index; i < n; i++) {
		for (const result of results(i + 1, remaining - 1)) yield [i, ...result]
	}
}
const ENCODE_RESULTS = [...results()]
assert.strictEqual(choose(n, k), BigInt(ENCODE_RESULTS.length))
for (let i = 0; i < ENCODE_RESULTS.length; i++) {
	const value = BigInt(i)
	const encoded = encode(n, k, value)
	assert.deepStrictEqual(encoded, ENCODE_RESULTS[i])
	assert.strictEqual(decode(n, encoded), value)
}
for (let i = 0; i < 100; i++) {
	const value = BigInt(i)
	const encoded = encode(100, 1, value)
	assert.deepStrictEqual(encoded, [i])
	assert.strictEqual(decode(100, encoded), value)
}

const buffer = new ReorderingBuffer
buffer.writeBytes(new Uint8Array([0xAA, 0xBB, 0xCC]).buffer)
buffer.writeUnordered(new Array(10).fill(0).map((_, i) => new Uint8Array([10 - i]).buffer))
assert.strictEqual((buffer as any).possibilities, BigInt(10 * 9 * 8 * 7 * 6 * 5 * 4 * 3 * 2 * 1))
assert.strictEqual((buffer as any).currentSet, 0)
assert.strictEqual((buffer as any).currentGroup, 0)
buffer.writeBytes(new Uint8Array([0xAB, 0xCD, 0x12, 0x34]).buffer)
assert.strictEqual((buffer as any).possibilities, 4n * 3n * 2n * 1n)
const reorderedBuffer = buffer.toBuffer()
assert.deepStrictEqual(
	new Uint8Array(reorderedBuffer),
	new Uint8Array([0xAA, 0xBB, 0xCC, 7, 1, 8, 5, 6, 3, 4, 9, 10, 2, 0x12, 0x34])
	/*
		Values:         1  2  3  4  5  6  7  8  9 10
		Possibilities: 10  9  8  7  6  5  4  3  2  1
		Split into:    10  9  3 -> 270 total possibilities
		                      2  7  6  4 -> 336 total possibilities
		Encoded values:
			0xAB == 1 + 10 * (8 + 9 * 1)
			0xCD == 1 + 2 * (4 + 7 * (2 + 6 * 2))

			1 2               3  4 5 6 7 8 9 10
			1 8 (1 + 3 * 1 == 4) 4 2 2 0 0 0  0
	*/
)
assert.deepStrictEqual(
	(buffer as any).sets.map(({equalGroups}: any) => equalGroups.map((group: any) =>
		({...group, bytes: new Uint8Array(group.bytes)})
	)),
	[
		[
			{
				elements: 1,
				bytes: new Uint8Array([0xAA, 0xBB, 0xCC]),
				remainingPossibilities: 1n,
				value: 0n,
				usedPossibilities: 1n
			}
		],
		[
			{
				elements: 1,
				bytes: new Uint8Array([1]),
				remainingPossibilities: 1n,
				value: 1n,
				usedPossibilities: 10n
			},
			{
				elements: 1,
				bytes: new Uint8Array([2]),
				remainingPossibilities: 1n,
				value: 8n,
				usedPossibilities: 9n
			},
			{
				elements: 1,
				bytes: new Uint8Array([3]),
				remainingPossibilities: 1n,
				value: 1n + 1n * 3n,
				usedPossibilities: 6n
			},
			{
				elements: 1,
				bytes: new Uint8Array([4]),
				remainingPossibilities: 1n,
				value: 4n,
				usedPossibilities: 7n
			},
			{
				elements: 1,
				bytes: new Uint8Array([5]),
				remainingPossibilities: 1n,
				value: 2n,
				usedPossibilities: 6n
			},
			{
				elements: 1,
				bytes: new Uint8Array([6]),
				remainingPossibilities: 1n,
				value: 2n,
				usedPossibilities: 4n
			},
			{
				elements: 1,
				bytes: new Uint8Array([7]),
				remainingPossibilities: 4n,
				value: 0n,
				usedPossibilities: 1n
			},
			{
				elements: 1,
				bytes: new Uint8Array([8]),
				remainingPossibilities: 3n,
				value: 0n,
				usedPossibilities: 1n
			},
			{
				elements: 1,
				bytes: new Uint8Array([9]),
				remainingPossibilities: 2n,
				value: 0n,
				usedPossibilities: 1n
			},
			{
				elements: 1,
				bytes: new Uint8Array([10]),
				remainingPossibilities: 1n,
				value: 0n,
				usedPossibilities: 1n
			}
		],
		[
			{
				elements: 1,
				bytes: new Uint8Array([0xAB, 0xCD, 0x12, 0x34]),
				remainingPossibilities: 1n,
				value: 0n,
				usedPossibilities: 1n
			}
		]
	]
)
assert.strictEqual((buffer as any).currentSet, 1)
assert.strictEqual((buffer as any).currentGroup, 6)
const buffer2 = new NoReorderingBuffer
buffer2.writeBytes(new Uint8Array([0xAA, 0xBB, 0xCC]).buffer)
buffer2.writeUnordered(new Array(10).fill(0).map((_, i) => new Uint8Array([10 - i]).buffer))
buffer2.writeBytes(new Uint8Array([0xAB, 0xCD, 0x12, 0x34]).buffer)
assert.deepStrictEqual(
	new Uint8Array(buffer2.toBuffer()),
	new Uint8Array([0xAA, 0xBB, 0xCC, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0xAB, 0xCD, 0x12, 0x34])
)

const readBuffer = new ReorderingReader(reorderedBuffer)
assert.deepStrictEqual(
	new Uint8Array(readBuffer.readBytes(3)),
	new Uint8Array([0xAA, 0xBB, 0xCC])
)
const unorderedChunks: ArrayBufferLike[] = []
for (let i = 0; i < 10; i++) unorderedChunks.push(readBuffer.readBytes(1))
assert.deepStrictEqual(
	new Set(unorderedChunks.map(chunk => new Uint8Array(chunk))),
	new Set(new Array(10).fill(0).map((_, i) => new Uint8Array([i + 1])))
)
readBuffer.addUnorderedSet(unorderedChunks)
assert.strictEqual((readBuffer as any).possibilities, BigInt(10 * 9 * 8 * 7 * 6 * 5 * 4 * 3 * 2 * 1))
assert.deepStrictEqual((readBuffer as any).groupValues, new Set([
	{possibilities: 10n, value: 1n},
	{possibilities: 9n,  value: 8n},
	{possibilities: 8n,  value: 4n},
	{possibilities: 7n,  value: 4n},
	{possibilities: 6n,  value: 2n},
	{possibilities: 5n,  value: 2n},
	{possibilities: 4n,  value: 0n},
	{possibilities: 3n,  value: 0n},
	{possibilities: 2n,  value: 0n},
	{possibilities: 1n,  value: 0n}
]))
assert.deepStrictEqual(new Uint8Array(readBuffer.readBytes(4)), new Uint8Array([0xAB, 0xCD, 0x12, 0x34]))
assert.strictEqual((readBuffer as any).possibilities, 4n * 3n * 2n * 1n)
assert.deepStrictEqual(
	(readBuffer as any).groupValues,
	new Set(new Array(4).fill(0).map((_, i) => ({possibilities: BigInt(4 - i), value: 0n})))
)