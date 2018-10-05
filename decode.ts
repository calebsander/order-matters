import {choose} from './util'

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