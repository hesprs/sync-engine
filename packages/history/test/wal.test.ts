import { captureContent, keyHash } from '@/chunker';
import { blobPresent, bumpLamport, markBlobs, openHistoryStores, readLamport } from '@/store';
import { FLAG_DELETION } from '@/types';
import { ingestDeletion, ingestEdit } from '@/wal';
import { expect, test } from 'bun:test';
import { openMemoryDB } from 'uni-kv';
import type { HistoryDatabase } from '@/store';

const encoder = new TextEncoder();

function setup() {
	const db = openMemoryDB(`history-${crypto.randomUUID()}`) as never as HistoryDatabase;
	return openHistoryStores(db, 'ns-test');
}

test('a small note is captured inline and busts the Lamport clock', async () => {
	const stores = setup();
	const entry = await ingestEdit(stores, 'note.md', encoder.encode('# Hello'));
	expect(entry.text).toBe('# Hello');
	expect(entry.chunkHashes).toBeUndefined();
	expect(entry.lamport).toBe(1);
	expect(await readLamport(stores)).toBe(1);
});

test('every edit is durable and the Lamport clock is strictly monotone', async () => {
	const stores = setup();
	const a = await ingestEdit(stores, 'note.md', encoder.encode('one'));
	const b = await ingestEdit(stores, 'note.md', encoder.encode('two'));
	const c = await ingestEdit(stores, 'other.md', encoder.encode('three'));
	expect([a.lamport, b.lamport, c.lamport]).toStrictEqual([1, 2, 3]);
	expect(a.parent).toBe('');
	expect(b.parent).toBe('note.md@1');
	expect(c.parent).toBe('');
	const pending = await stores.pending.values();
	expect(pending).toHaveLength(3);
});

test('a large note is split by FastCDC and only unseen chunk bytes are kept', async () => {
	const stores = setup();
	const data = new Uint8Array(20 * 1024);
	for (let i = 0; i < data.byteLength; i++) data[i] = i & 0xff;
	const entry = await ingestEdit(stores, 'big.md', data);
	expect(entry.text).toBeUndefined();
	expect(entry.chunkHashes?.length).toBeGreaterThan(5);
	expect(entry.newChunks?.length).toBe(new Set(entry.chunkHashes).size);
	// Once a flush confirms the chunks in the CAS index, a re-ingest produces no new bytes.
	for (const chunk of entry.newChunks ?? [])
		await stores.chunks.set(chunk.hash, {
			length: chunk.bytes.byteLength,
			offset: 0,
			pack: { deviceId: 'd', fromLamport: 0, hash: 'h', seq: 0, toLamport: 0 },
		});
	const again = await ingestEdit(stores, 'big.md', data);
	expect(again.newChunks).toStrictEqual([]);
});

test('a big attachment is stored as a standalone blob', async () => {
	const stores = setup();
	const data = new Uint8Array(5 * 1024 * 1024 + 1);
	const content = await captureContent(stores, 'image.png', data);
	expect(content.blobs).toHaveLength(1);
	expect(content.blobs?.[0].hash).toHaveLength(64);
	expect(content.chunkHashes).toBeUndefined();
});

test('keyHash is NFC-normalized and content-addressed', async () => {
	const a = await keyHash('café.md');
	const b = await keyHash('cafe\u0301.md');
	expect(a).toBe(b);
	expect(a).toHaveLength(64);
});

test('confirmed-present blob set is persisted and queryable', async () => {
	const stores = setup();
	const blob = { hash: 'abc123', key: 'image.png', size: 10 };
	expect(await blobPresent(stores, blob.hash)).toBe(false);
	await markBlobs(stores, [blob]);
	expect(await blobPresent(stores, blob.hash)).toBe(true);
});

test('the Lamport clock folds in observed remote lamports', async () => {
	const stores = setup();
	await ingestEdit(stores, 'note.md', encoder.encode('one'));
	expect(await readLamport(stores)).toBe(1);
	// A remote head log reports a higher peak; the next local edit must be ordered after it.
	await bumpLamport(stores, 50);
	expect(await readLamport(stores)).toBeGreaterThan(50);
	const next = await ingestEdit(stores, 'note.md', encoder.encode('two'));
	expect(next.lamport).toBeGreaterThan(50);
});

test('ingestDeletion captures a deletion with FLAG_DELETION and bumps Lamport', async () => {
	const stores = setup();
	await ingestEdit(stores, 'deleted.md', encoder.encode('before delete'));
	const deletion = await ingestDeletion(stores, 'deleted.md');
	expect(deletion.flags).toBe(FLAG_DELETION);
	expect(deletion.parent).toBe('deleted.md@1');
	expect(deletion.lamport).toBe(2);
});
