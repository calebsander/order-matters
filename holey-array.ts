import assert from 'assert'

export interface LookupResult {
	index: number
	newArray: HoleyArray
}
export interface HoleyArray {
	readonly length: number
	readonly totalHoles: number
	lookup(lookupIndex: number): LookupResult
}

class HolelessSegment implements HoleyArray {
	constructor(
		public readonly length: number,
		private readonly reverse: boolean
	) {}

	lookup(index: number): LookupResult {
		return {
			index,
			newArray: new SplitSegment(
				index,
				new HolelessSegment(index, this.reverse),
				new HolelessSegment(this.length - 1 - index, this.reverse),
				this.reverse
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
		private readonly right: HoleyArray,
		private readonly reverse: boolean
	) {
		this.length = this.left.length + this.right.length
		this.totalHoles = this.left.totalHoles + 1 + this.right.totalHoles
	}

	lookup(lookupIndex: number): LookupResult {
		const splitRelativeIndex = lookupIndex - this.splitIndex
		if (this.reverse) assert(splitRelativeIndex)
		if (splitRelativeIndex < 0) {
			const {index, newArray} = this.left.lookup(lookupIndex)
			return {
				index,
				newArray: new SplitSegment(
					this.splitIndex - (this.reverse ? 0 : 1),
					newArray,
					this.right,
					this.reverse
				)
			}
		}
		else {
			const {index, newArray} = this.right.lookup(splitRelativeIndex)
			return {
				index: (this.reverse ? this.left.length - 1 : this.left.totalHoles + this.splitIndex + 1) + index,
				newArray: new SplitSegment(this.splitIndex, this.left, newArray, this.reverse)
			}
		}
	}
}

export const makeHoleyArray = (length: number, reverse: boolean): HoleyArray =>
	new HolelessSegment(length, reverse)