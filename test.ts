import * as assert from 'assert'
import {HoleyArray, makeHoleyArray} from './holey-array'
import {choose, encode, ReorderingBuffer} from './reordering-buffer'

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
	let holeyArray: HoleyArray = makeHoleyArray(length)
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
function *results(index = 0, remaining = k): IterableIterator<number[]> {
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
	assert.deepStrictEqual(encode(n, k, i), ENCODE_RESULTS[i])
}
for (let i = 0; i < 100; i++) {
	assert.deepStrictEqual(encode(100, 1, i), [i])
}

const buffer = new ReorderingBuffer
buffer.writeUnordered(new Array(10).fill(0).map((_, i) => new Uint8Array([10 - i]).buffer))
buffer.writeBytes(new Uint8Array([0xAB, 0xCD, 0x12, 0x34]).buffer)
assert.deepStrictEqual(
	new Uint8Array(buffer.toBuffer()),
	new Uint8Array([3, 1, 7, 6, 5, 8, 9, 2, 4, 10, 0x12, 0x34])
	//              0  1  X  1  2  X  X  6  5  X
	// 1 + 10 * (6 + 9 * (0 + 8 * (5 + 7 * (2 + 6 * 1)))) === 0xABCD
)