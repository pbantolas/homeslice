export function veryClose(a: number, b: number, eps: number = 1e-4): boolean {
	return Math.abs(a - b) < eps;
}
