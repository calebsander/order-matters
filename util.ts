export function choose(n: number, k: number) {
	let product = 1n
	for (let i = n; i > k; i--) product *= BigInt(i)
	for (let i = n - k; i > 1; i--) product /= BigInt(i)
	return product
}