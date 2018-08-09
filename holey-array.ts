export interface LookupResult {
	index: number
	newArray: HoleyArray
}
export interface HoleyArray {
	readonly length: number
	readonly totalHoles: number
	lookup(contiguousIndex: number): LookupResult
}

class HolelessSegment implements HoleyArray {
	constructor(public readonly length: number) {}

	lookup(index: number): LookupResult {
		const newLength = this.length - 1
		return {
			index,
			newArray: new SplitSegment(
				index,
				new HolelessSegment(index),
				new HolelessSegment(newLength - index)
			)
		}
	}
	get totalHoles() { return 0 }
}
class SplitSegment implements HoleyArray {
	public readonly length: number
	public readonly totalHoles: number

	constructor(
		private readonly splitIndex: number,
		private readonly left: HoleyArray,
		private readonly right: HoleyArray
	) {
		this.length = this.left.length + this.right.length
		this.totalHoles = this.left.totalHoles + 1 + this.right.totalHoles
	}

	lookup(contiguousIndex: number): LookupResult {
		const splitRelativeIndex = contiguousIndex - this.splitIndex
		if (splitRelativeIndex < 0) {
			const {index, newArray} = this.left.lookup(contiguousIndex)
			return {
				index,
				newArray: new SplitSegment(this.splitIndex - 1, newArray, this.right)
			}
		}
		else {
			const {index, newArray} = this.right.lookup(splitRelativeIndex)
			return {
				index: this.left.totalHoles + this.splitIndex + 1 + index,
				newArray: new SplitSegment(this.splitIndex, this.left, newArray)
			}
		}
	}
}

export const makeHoleyArray = (length: number) =>
	new HolelessSegment(length)