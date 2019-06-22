import test, {ExecutionContext} from 'ava'
import {decode, ReorderingReader} from './dist/decode'
import {encode, ReorderingBuffer} from './dist/encode'
import {makeHoleyArray} from './dist/holey-array'
import {BYTE_POSSIBILITIES, choose, compare} from './dist/util'

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

function simpleReorderedBuffer(t: ExecutionContext<{}>) {
	const buffer = new ReorderingBuffer
	buffer.writeBytes(new Uint8Array([0xAA, 0xBB, 0xCC]).buffer)
	buffer.writeUnordered(new Array(10).fill(0).map((_, i) => new Uint8Array([10 - i]).buffer))
	t.is((buffer as any).possibilities, BigInt(10 * 9 * 8 * 7 * 6 * 5 * 4 * 3 * 2 * 1))
	t.is((buffer as any).currentSet, 0)
	t.is((buffer as any).currentGroup, 0)
	buffer.writeBytes(new Uint8Array([0xAB, 0xCD, 0x12, 0x34]).buffer)
	t.is((buffer as any).possibilities, BigInt(4 * 3 * 2 * 1))
	return {
		buffer,
		reorderedBuffer: buffer.toBuffer()
	}
}

test('holey-array', t => {
	const TEST_TIMES = 10
	const MAX_ARRAY_SIZE = 1e5
	for (let _ = 0; _ < TEST_TIMES; _++) {
		let length = rand(MAX_ARRAY_SIZE)
		let holeyArray = makeHoleyArray(length)
		let reverseHoleyArray = makeHoleyArray(length)
		const markedArray = new MarkedArray(length)
		while (length) {
			const addIndex = rand(length--)
			let index: number
			({index, newArray: holeyArray} = holeyArray.lookup(addIndex, false))
			const markedIndex = markedArray.lookup(addIndex)
			t.is(index, markedIndex)
			t.is(holeyArray.spaces, length)
			;({index, newArray: reverseHoleyArray} = reverseHoleyArray.lookup(index, true))
			t.is(index, addIndex)
			t.is(reverseHoleyArray.spaces, length)
		}
		// Ensure holey arrays are coalesced to a single HolesNode
		t.is(holeyArray.constructor.name, 'HolesNode')
		t.is(reverseHoleyArray.constructor.name, 'HolesNode')
	}
})
test('choose', t => {
	const CHOOSE_RESULTS = [
		{n: 0, k: 0, result: 1},
		{n: 1, k: 0, result: 1},
		{n: 1, k: 1, result: 1},
		{n: 2, k: 0, result: 1},
		{n: 2, k: 1, result: 2},
		{n: 2, k: 2, result: 1},
		{n: 10, k: 0, result: 1},
		{n: 10, k: 1, result: 10},
		{n: 10, k: 2, result: 45},
		{n: 10, k: 3, result: 120},
		{n: 10, k: 4, result: 210},
		{n: 10, k: 5, result: 252},
		{n: 10, k: 6, result: 210},
		{n: 10, k: 7, result: 120},
		{n: 10, k: 8, result: 45},
		{n: 10, k: 9, result: 10},
		{n: 10, k: 10, result: 1}
	]
	for (const {n, k, result} of CHOOSE_RESULTS) t.is(choose(n, k), BigInt(result))
})
test('encode/decode', t => {
	const n = 20, k = 5
	function* choices(index = 0, remaining = k): IterableIterator<number[]> {
		if (!remaining) {
			yield []
			return
		}
		for (let i = index; i < n; i++) {
			for (const result of choices(i + 1, remaining - 1)) yield [i, ...result]
		}
	}
	const ENCODE_RESULTS = [...choices()]
	t.is(choose(n, k), BigInt(ENCODE_RESULTS.length))
	for (let i = 0; i < ENCODE_RESULTS.length; i++) {
		const value = BigInt(i)
		const encoded = encode(n, k, value)
		t.deepEqual(encoded, ENCODE_RESULTS[i])
		t.is(decode(n, encoded), value)
	}
	for (let i = 0; i < 100; i++) {
		const value = BigInt(i)
		const encoded = encode(100, 1, value)
		t.deepEqual(encoded, [i])
		t.is(decode(100, encoded), value)
	}
})
test('simple reorder', t => {
	const {buffer, reorderedBuffer} = simpleReorderedBuffer(t)
	t.deepEqual(
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
	t.deepEqual(
		(buffer as any).sets.map(({equalGroups}: any) => equalGroups.map((group: any) =>
			({
				...group,
				bytes: new Uint8Array(group.bytes),
				remainingPossibilities: Number(group.remainingPossibilities),
				value: Number(group.value),
				usedPossibilities: Number(group.usedPossibilities)
			})
		)),
		[
			[
				{
					elements: 1,
					bytes: new Uint8Array([0xAA, 0xBB, 0xCC]),
					remainingPossibilities: 1,
					value: 0,
					usedPossibilities: 1
				}
			],
			[
				{
					elements: 1,
					bytes: new Uint8Array([1]),
					remainingPossibilities: 1,
					value: 1,
					usedPossibilities: 10
				},
				{
					elements: 1,
					bytes: new Uint8Array([2]),
					remainingPossibilities: 1,
					value: 8,
					usedPossibilities: 9
				},
				{
					elements: 1,
					bytes: new Uint8Array([3]),
					remainingPossibilities: 1,
					value: 1 + 1 * 3,
					usedPossibilities: 6
				},
				{
					elements: 1,
					bytes: new Uint8Array([4]),
					remainingPossibilities: 1,
					value: 4,
					usedPossibilities: 7
				},
				{
					elements: 1,
					bytes: new Uint8Array([5]),
					remainingPossibilities: 1,
					value: 2,
					usedPossibilities: 6
				},
				{
					elements: 1,
					bytes: new Uint8Array([6]),
					remainingPossibilities: 1,
					value: 2,
					usedPossibilities: 4
				},
				{
					elements: 1,
					bytes: new Uint8Array([7]),
					remainingPossibilities: 4,
					value: 0,
					usedPossibilities: 1
				},
				{
					elements: 1,
					bytes: new Uint8Array([8]),
					remainingPossibilities: 3,
					value: 0,
					usedPossibilities: 1
				},
				{
					elements: 1,
					bytes: new Uint8Array([9]),
					remainingPossibilities: 2,
					value: 0,
					usedPossibilities: 1
				},
				{
					elements: 1,
					bytes: new Uint8Array([10]),
					remainingPossibilities: 1,
					value: 0,
					usedPossibilities: 1
				}
			],
			[
				{
					elements: 1,
					bytes: new Uint8Array([0xAB, 0xCD, 0x12, 0x34]),
					remainingPossibilities: 1,
					value: 0,
					usedPossibilities: 1
				}
			]
		]
	)
	t.is((buffer as any).currentSet, 1)
	t.is((buffer as any).currentGroup, 6)
})
test('simple unorder', t => {
	const {reorderedBuffer} = simpleReorderedBuffer(t)
	const readBuffer = new ReorderingReader(reorderedBuffer)
	t.deepEqual(new Uint8Array(readBuffer.readBytes(3)), new Uint8Array([0xAA, 0xBB, 0xCC]))
	const unorderedChunks: ArrayBufferLike[] = []
	for (let i = 0; i < 10; i++) unorderedChunks.push(readBuffer.readBytes(1))
	t.deepEqual(
		unorderedChunks.slice().sort(compare).map(chunk => new Uint8Array(chunk)),
		new Array(10).fill(0).map((_, i) => new Uint8Array([i + 1]))
	)
	readBuffer.addUnorderedSet(unorderedChunks)
	t.is((readBuffer as any).possibilities, BigInt(10 * 9 * 8 * 7 * 6 * 5 * 4 * 3 * 2 * 1))
	t.deepEqual(
		[...(readBuffer as any).groupValues].map(group =>
			({possibilities: Number(group.possibilities), value: Number(group.value)})
		),
		[
			{possibilities: 10, value: 1},
			{possibilities: 9,  value: 8},
			{possibilities: 8,  value: 4},
			{possibilities: 7,  value: 4},
			{possibilities: 6,  value: 2},
			{possibilities: 5,  value: 2},
			{possibilities: 4,  value: 0},
			{possibilities: 3,  value: 0},
			{possibilities: 2,  value: 0},
			{possibilities: 1,  value: 0}
		]
	)
	t.deepEqual(new Uint8Array(readBuffer.readBytes(4)), new Uint8Array([0xAB, 0xCD, 0x12, 0x34]))
	t.is((readBuffer as any).possibilities, BigInt(4 * 3 * 2 * 1))
	t.deepEqual(
		[...(readBuffer as any).groupValues].map(group =>
			({possibilities: Number(group.possibilities), value: Number(group.value)})
		),
		new Array(4).fill(0).map((_, i) =>
			({possibilities: 4 - i, value: 0})
		)
	)
})
test('random data order/unorder', t => {
	const TEST_TIMES = 1e5
	for (let _ = 0; _ < TEST_TIMES; _++) {
		const sets = new Array(rand(10)).fill(0).map(_ => {
			const chunkLength = rand(10)
			return new Array(rand(10)).fill(0).map(_ =>
				new Uint8Array(chunkLength).map(_ => rand(BYTE_POSSIBILITIES)).buffer
			)
		})
		const writer = new ReorderingBuffer
		for (const set of sets) writer.writeUnordered(set)
		const buffer = writer.toBuffer()
		const reader = new ReorderingReader(buffer)
		for (const set of sets) {
			const readChunks = set.map(({byteLength}) => reader.readBytes(byteLength))
			t.deepEqual(
				set.slice().sort(compare).map(chunk => new Uint8Array(chunk)),
				readChunks.slice().sort(compare).map(chunk => new Uint8Array(chunk))
			)
			reader.addUnorderedSet(readChunks)
		}
		t.is((reader as any).readPosition, buffer.byteLength)
	}
})