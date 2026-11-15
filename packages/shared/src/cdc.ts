import { textToUint8Array } from './binary';
import { fastCdc } from './fastcdc';
import { sha256Bytes } from './sha256-bytes';
import type { FastCdcOptions } from './fastcdc';

export { BIG_BLOB_LIMIT, fastCdc, SMALL_FILE_LIMIT } from './fastcdc';
export type { ChunkSpan, FastCdcOptions } from './fastcdc';

const textDecoder = new TextDecoder();

export type ChunkItem = { bytes: Uint8Array; hash: string };

export type ChunkDiff = { chunkHashes: Array<string>; newChunks: Map<string, Uint8Array> };

/**
 * Returns adaptive FastCDC parameters according to input byte length. Keeps chunk count and
 * manifest size bounded even on multi-megabyte files.
 */
export function adaptiveCdcOptions(byteLength: number): FastCdcOptions {
	if (byteLength <= 1024 * 1024) return { avg: 1024, max: 4096, min: 512 };
	if (byteLength <= 8 * 1024 * 1024) return { avg: 4096, max: 16_384, min: 2048 };
	return { avg: 16_384, max: 65_536, min: 4096 };
}

/**
 * Splits arbitrary byte buffer into content-defined chunks and computes SHA-256 hash for each chunk
 * in parallel.
 */
export async function chunkContent(
	data: Uint8Array,
	options?: FastCdcOptions,
): Promise<Array<ChunkItem>> {
	const spans = fastCdc(data, options);
	return Promise.all(
		spans.map(async (span) => {
			const bytes = data.subarray(span.offset, span.offset + span.length);
			return { bytes, hash: await sha256Bytes(bytes) };
		}),
	);
}

/** Splits UTF-8 text into content-defined chunks. */
export function chunkText(text: string, options?: FastCdcOptions): Promise<Array<ChunkItem>> {
	return chunkContent(textToUint8Array(text), options);
}

/**
 * Concatenates ordered chunk byte arrays into a single Uint8Array. Safe across arbitrary chunk
 * boundaries (including multi-byte UTF-8 split points).
 */
export function assembleChunks(chunks: Array<Uint8Array>): Uint8Array {
	let total = 0;
	for (const chunk of chunks) total += chunk.byteLength;
	const joined = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		joined.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return joined;
}

/** Concatenates ordered chunk byte arrays and decodes them into UTF-8 text. */
export function assembleChunksToText(chunks: Array<Uint8Array>): string {
	return textDecoder.decode(assembleChunks(chunks));
}

/**
 * Compares chunk list against known hashes to produce a full hash manifest and a map of only
 * unseen/new chunk payloads.
 */
export function computeChunkDiff(
	chunks: Array<ChunkItem>,
	isKnown: (hash: string) => boolean,
): ChunkDiff {
	const chunkHashes: Array<string> = [];
	const newChunks = new Map<string, Uint8Array>();
	for (const { bytes, hash } of chunks) {
		chunkHashes.push(hash);
		if (!isKnown(hash) && !newChunks.has(hash)) newChunks.set(hash, bytes);
	}
	return { chunkHashes, newChunks };
}

/**
 * Reassembles raw bytes from a chunk hash list using a chunk resolver. Returns undefined if any
 * chunk hash cannot be resolved (missing chunk).
 */
function reassembleFromChunks(
	chunkHashes: Array<string>,
	getChunk: (hash: string) => Uint8Array | undefined,
): Uint8Array | undefined {
	const pieces: Array<Uint8Array> = [];
	for (const hash of chunkHashes) {
		const chunk = getChunk(hash);
		if (chunk === undefined) return undefined;
		pieces.push(chunk);
	}
	return assembleChunks(pieces);
}

/**
 * Reassembles UTF-8 text from a chunk hash list using a chunk resolver. Returns undefined if any
 * chunk hash cannot be resolved.
 */
export function reassembleTextFromChunks(
	chunkHashes: Array<string>,
	getChunk: (hash: string) => Uint8Array | undefined,
): string | undefined {
	const bytes = reassembleFromChunks(chunkHashes, getChunk);
	return bytes ? textDecoder.decode(bytes) : undefined;
}

/**
 * Lightweight, memory-bounded in-memory LRU chunk cache. Designed for mobile platforms to prevent
 * unbounded memory growth while keeping recent chunks immediately available for incremental diff
 * and reassembly.
 */
export class LRUChunkCache {
	private readonly cache = new Map<string, Uint8Array>();
	private currentBytes = 0;

	constructor(
		private readonly maxEntries = 4096,
		private readonly maxBytes = 16 * 1024 * 1024,
	) {}

	get(hash: string): Uint8Array | undefined {
		const chunk = this.cache.get(hash);
		if (chunk !== undefined) {
			this.cache.delete(hash);
			this.cache.set(hash, chunk);
		}
		return chunk;
	}

	has(hash: string): boolean {
		return this.cache.has(hash);
	}

	set(hash: string, bytes: Uint8Array): void {
		if (this.cache.has(hash)) this.cache.delete(hash);
		else this.currentBytes += bytes.byteLength;

		this.cache.set(hash, bytes);
		this.evict();
	}

	putAll(chunks: Iterable<{ bytes: Uint8Array; hash: string }>): void {
		for (const { bytes, hash } of chunks) this.set(hash, bytes);
	}

	clear(): void {
		this.cache.clear();
		this.currentBytes = 0;
	}

	get size(): number {
		return this.cache.size;
	}

	get byteLength(): number {
		return this.currentBytes;
	}

	private evict(): void {
		while (
			(this.cache.size > this.maxEntries || this.currentBytes > this.maxBytes) &&
			this.cache.size > 0
		) {
			const oldestKey = this.cache.keys().next().value;
			if (oldestKey === undefined) break;
			const chunk = this.cache.get(oldestKey);
			if (chunk !== undefined) this.currentBytes -= chunk.byteLength;
			this.cache.delete(oldestKey);
		}
	}
}
