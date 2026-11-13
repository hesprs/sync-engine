import { BIG_BLOB_LIMIT, fastCdc, SMALL_FILE_LIMIT } from '@repo/shared/fastcdc';
import { sha256Bytes, sha256Text } from '@repo/shared/sha256-bytes';
import type { HistoryStores } from '@/store';
import type { BlobRef } from '@/types';

const decoder = new TextDecoder();

export type ChunkedContent = {
	text?: string;
	chunkHashes?: Array<string>;
	newChunks?: Array<{ hash: string; bytes: Uint8Array }>;
	blobs?: Array<BlobRef>;
	blobData?: Array<{ hash: string; bytes: Uint8Array }>;
};

export const TEXT_EXTS = ['.md', '.canvas', '.txt', '.json', '.base'];
export const isTextFile = (path: string): boolean =>
	TEXT_EXTS.some((ext) => path.toLowerCase().endsWith(ext));

/** Hashes a unified key for `IndexEntry.keyHash`, normalized to NFC. */
export function keyHash(key: string): Promise<string> {
	return sha256Text(key.normalize('NFC'));
}

/**
 * Routes content at WAL ingestion. Small notes are stored inline; larger notes are split by FastCDC
 * and only unseen chunk bytes are kept; attachments and big notes become standalone blobs.
 */
export async function captureContent(
	stores: HistoryStores,
	key: string,
	data: Uint8Array,
): Promise<ChunkedContent> {
	const normalizedKey = key.normalize('NFC');
	if (!isTextFile(normalizedKey) || data.byteLength >= BIG_BLOB_LIMIT) {
		const hash = await sha256Bytes(data);
		return {
			blobData: [{ bytes: new Uint8Array(data), hash }],
			blobs: [{ hash, key: normalizedKey, size: data.byteLength }],
		};
	}
	if (data.byteLength < SMALL_FILE_LIMIT) return { text: decoder.decode(data) };

	const spans = fastCdc(data);
	const rawChunks = await Promise.all(
		spans.map(async (span) => {
			const bytes = data.subarray(span.offset, span.offset + span.length);
			return { bytes, hash: await sha256Bytes(bytes) };
		}),
	);
	const chunkHashes = rawChunks.map((c) => c.hash);
	const uniqueChunks = new Map<string, Uint8Array>();
	for (const { bytes, hash } of rawChunks)
		if (!uniqueChunks.has(hash)) uniqueChunks.set(hash, bytes);

	const newChunks: Array<{ hash: string; bytes: Uint8Array }> = [];
	await Promise.all(
		[...uniqueChunks.entries()].map(async ([hash, bytes]) => {
			const existing = await stores.chunks.get(hash);
			if (existing === undefined) newChunks.push({ bytes: new Uint8Array(bytes), hash });
		}),
	);
	return { chunkHashes, newChunks };
}

/** Reassembles text from ordered chunk bytes. Used by the restore planner. */
export function assembleChunks(chunks: Array<Uint8Array>): string {
	let total = 0;
	for (const chunk of chunks) total += chunk.byteLength;
	const joined = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		joined.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return decoder.decode(joined);
}
