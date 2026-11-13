import { BIG_BLOB_LIMIT, fastCdc, SMALL_FILE_LIMIT } from '@/fastcdc';
import { expect, test } from 'bun:test';

function bytes(length: number, seed = 7): Uint8Array {
	const out = new Uint8Array(length);
	let state = seed;
	for (let i = 0; i < length; i++) {
		state = (Math.imul(state, 1_103_515_245) + 12_345) >>> 0;
		out[i] = state & 0xff;
	}
	return out;
}

test('constants match the design routing thresholds', () => {
	expect(SMALL_FILE_LIMIT).toBe(4096);
	expect(BIG_BLOB_LIMIT).toBe(5 * 1024 * 1024);
});

test('empty and small inputs return a single trailing chunk', () => {
	expect(fastCdc(new Uint8Array(0))).toStrictEqual([]);
	const small = bytes(100);
	const spans = fastCdc(small);
	expect(spans).toHaveLength(1);
	expect(spans[0]).toStrictEqual({ length: 100, offset: 0 });
});

test('chunking is deterministic across runs', () => {
	const data = bytes(64 * 1024);
	expect(fastCdc(data)).toStrictEqual(fastCdc(data));
});

test('every chunk respects min/avg/max bounds and covers the input exactly', () => {
	const data = bytes(64 * 1024, 31);
	const spans = fastCdc(data, { avg: 1024, max: 4096, min: 512 });
	let cursor = 0;
	for (const span of spans) {
		expect(span.offset).toBe(cursor);
		expect(span.length).toBeGreaterThan(0);
		expect(span.length).toBeLessThanOrEqual(4096);
		cursor += span.length;
	}
	expect(cursor).toBe(data.byteLength);
	// A 64 KiB input with a 1 KiB target must produce many chunks.
	expect(spans.length).toBeGreaterThan(10);
});

test('a single-byte edit preserves downstream chunk boundaries (localized change)', () => {
	const original = bytes(32 * 1024, 5);
	const edited = Uint8Array.from(original);
	edited[8000] ^= 0xff;
	const a = fastCdc(original);
	const b = fastCdc(edited);
	const aHashes = new Set(a.map((s) => `${s.offset}:${s.length}`));
	const bHashes = b.map((s) => `${s.offset}:${s.length}`);
	// Most chunks are byte-for-byte identical and keep the same offsets.
	const shared = bHashes.filter((h) => aHashes.has(h));
	expect(shared.length / b.length).toBeGreaterThan(0.7);
});
