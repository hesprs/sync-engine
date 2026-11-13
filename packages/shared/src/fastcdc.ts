export const SMALL_FILE_LIMIT = 4096;
export const BIG_BLOB_LIMIT = 5 * 1024 * 1024;

export type ChunkSpan = { offset: number; length: number };
export type FastCdcOptions = { min?: number; avg?: number; max?: number };

// Deterministic 256-entry gear table. No external RNG so chunk boundaries are reproducible
// across devices, which is required for content-addressed deduplication.
const GEAR = (() => {
	const table = new Uint32Array(256);
	let state = 0x9e_37_79_b9;
	for (let i = 0; i < 256; i++) {
		state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
		table[i] = state;
	}
	return table;
})();

function maskFor(avg: number, min: number, max: number): { small: number; large: number } {
	// FastCDC uses two masks: a harder one until the minimum, then an easier one to bound the tail.
	let bits = 0;
	let value = 1;
	while (value < avg) {
		value *= 2;
		bits++;
	}
	const easy = (1 << bits) - 1;
	const hard = (1 << (bits + 2)) - 1;
	// Clamp so the min/max guards remain meaningful for unusual options.
	return { large: Math.min(easy, max - min), small: Math.min(hard, max - min) };
}

/**
 * Content-defined chunking over a gear hash. A rolling 32-bit hash hits a normalization mask to
 * pick boundaries, so a local edit only shifts one or two chunks and leaves the rest intact.
 */
export function fastCdc(bytes: Uint8Array, options: FastCdcOptions = {}): Array<ChunkSpan> {
	const min = options.min ?? 512;
	const avg = options.avg ?? 1024;
	const max = options.max ?? 4096;
	const { small, large } = maskFor(avg, min, max);
	const spans: Array<ChunkSpan> = [];
	if (bytes.byteLength === 0) return spans;

	let start = 0;
	while (start < bytes.byteLength) {
		const remaining = bytes.byteLength - start;
		if (remaining <= min) {
			spans.push({ length: remaining, offset: start });
			break;
		}
		const limit = Math.min(max, remaining);
		let hash = 0;
		let cut = limit;
		for (let i = 0; i < limit; i++) {
			hash = ((hash << 1) + GEAR[bytes[start + i]]) >>> 0;
			if (i + 1 < min) continue;
			const mask = i + 1 < avg ? small : large;
			if ((hash & mask) === 0) {
				cut = i + 1;
				break;
			}
		}
		spans.push({ length: cut, offset: start });
		start += cut;
	}
	return spans;
}
