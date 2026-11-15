import { textToUint8Array } from '@/binary';
import {
	adaptiveCdcOptions,
	assembleChunks,
	assembleChunksToText,
	chunkContent,
	chunkText,
	computeChunkDiff,
	LRUChunkCache,
	reassembleTextFromChunks,
} from '@/cdc';
import { expect, test } from 'bun:test';

test('chunkContent and assembleChunks roundtrip arbitrary bytes', async () => {
	const text = 'Hello world! '.repeat(500); // ~6.5 KB
	const bytes = textToUint8Array(text);
	const chunks = await chunkContent(bytes);

	expect(chunks.length).toBeGreaterThan(1);
	for (const chunk of chunks) {
		expect(chunk.hash).toMatch(/^[0-9a-f]{64}$/u);
		expect(chunk.bytes.byteLength).toBeGreaterThan(0);
	}

	const assembled = assembleChunks(chunks.map((c) => c.bytes));
	expect(assembled).toEqual(bytes);
	expect(assembleChunksToText(chunks.map((c) => c.bytes))).toBe(text);
});

test('chunkText preserves multibyte UTF-8 characters across boundaries', async () => {
	const unicode = '你好，世界！这是一段包含多字节字符的中文测试文本。'.repeat(100);
	const chunks = await chunkText(unicode);
	expect(chunks.length).toBeGreaterThan(1);

	const restored = assembleChunksToText(chunks.map((c) => c.bytes));
	expect(restored).toBe(unicode);
});

test('adaptiveCdcOptions selects larger bounds for larger files', () => {
	const small = adaptiveCdcOptions(500 * 1024);
	expect(small.avg).toBe(1024);
	expect(small.max).toBe(4096);

	const medium = adaptiveCdcOptions(4 * 1024 * 1024);
	expect(medium.avg).toBe(4096);
	expect(medium.max).toBe(16_384);

	const huge = adaptiveCdcOptions(10 * 1024 * 1024);
	expect(huge.avg).toBe(16_384);
	expect(huge.max).toBe(65_536);
});

test('computeChunkDiff detects new vs known chunks accurately', async () => {
	const base = `Stable header\n${'A'.repeat(10_000)}\nStable footer`;
	const baseChunks = await chunkText(base);
	const knownHashes = new Set(baseChunks.map((c) => c.hash));

	// Modify one line in the middle
	const modified = `Stable header\n${'A'.repeat(5000)}MODIFIED${'A'.repeat(4992)}\nStable footer`;
	const modifiedChunks = await chunkText(modified);

	const diff = computeChunkDiff(modifiedChunks, (hash) => knownHashes.has(hash));
	expect(diff.chunkHashes.length).toBe(modifiedChunks.length);
	// Only a small window of chunks around the edit change, the rest remain identical
	expect(diff.newChunks.size).toBeLessThanOrEqual(4);
	expect(diff.newChunks.size).toBeGreaterThan(0);
});

test('reassembleTextFromChunks returns undefined if any chunk is missing', async () => {
	const text = 'Line 1\n'.repeat(1000);
	const chunks = await chunkText(text);
	const chunkMap = new Map(chunks.map((c) => [c.hash, c.bytes]));

	// 1. All chunks available
	const success = reassembleTextFromChunks(
		chunks.map((c) => c.hash),
		(h) => chunkMap.get(h),
	);
	expect(success).toBe(text);

	// 2. One chunk missing
	const firstHash = chunks[0].hash;
	chunkMap.delete(firstHash);
	const failed = reassembleTextFromChunks(
		chunks.map((c) => c.hash),
		(h) => chunkMap.get(h),
	);
	expect(failed).toBeUndefined();
});

test('LRUChunkCache evicts oldest entries when capacity or bytes exceed limit', () => {
	const cache = new LRUChunkCache(3, 100);
	const b1 = new Uint8Array([1, 2, 3]);
	const b2 = new Uint8Array([4, 5, 6]);
	const b3 = new Uint8Array([7, 8, 9]);
	const b4 = new Uint8Array([10, 11, 12]);

	cache.set('h1', b1);
	cache.set('h2', b2);
	cache.set('h3', b3);
	expect(cache.size).toBe(3);

	// Access h1 to make it most recently used
	cache.get('h1');

	// Insert h4 -> should evict h2 (oldest)
	cache.set('h4', b4);
	expect(cache.size).toBe(3);
	expect(cache.has('h2')).toBe(false);
	expect(cache.has('h1')).toBe(true);
	expect(cache.has('h3')).toBe(true);
	expect(cache.has('h4')).toBe(true);
});
