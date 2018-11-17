const BYTE_BITS = 8
export const BYTE_POSSIBILITIES = 1 << BYTE_BITS

export function choose(n: number, k: number) {
	let product = 1n
	for (let i = n; i > k; i--) product *= BigInt(i)
	for (let i = n - k; i > 1; i--) product /= BigInt(i)
	return product
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