import {HoleyArray, makeHoleyArray} from './holey-array'

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
	print() {
		console.log(this.marked.map(x => x ? 'X' : '_').join(' '))
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
		if (index !== markedIndex) {
			console.error('Initial length', length + addIndices.length)
			console.error('Indices', addIndices)
			throw new Error(`Indices don't match: expected ${markedIndex}, got ${index}`)
		}
		if (holeyArray.totalHoles !== addIndices.length) {
			throw new Error(`Number of holes doesn't match: expected ${addIndices.length}, got ${holeyArray.totalHoles}`)
		}
	}
}