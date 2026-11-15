import { TEXT_EXTS } from '@/constants';
import { BIG_BLOB_LIMIT, chunkContent, SMALL_FILE_LIMIT } from '@repo/shared/cdc';
import { sha256Bytes, sha256Text } from '@repo/shared/sha256-bytes';
import type { HistoryStores } from '@/store';
import type { BlobRef } from '@/types';

export { TEXT_EXTS } from '@/constants';
export { assembleChunksToText as assembleChunks } from '@repo/shared/cdc';

const decoder = new TextDecoder();

export type ChunkedContent = {
	text?: string;
	chunkHashes?: Array<string>;
	newChunks?: Array<{ hash: string; bytes: Uint8Array }>;
	blobs?: Array<BlobRef>;
	blobData?: Array<{ hash: string; bytes: Uint8Array }>;
};

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

	const rawChunks = await chunkContent(data);
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
