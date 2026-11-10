import { keyHash } from '@/chunker';
import { flushPending } from '@/flush';
import { encodePack, packFileName } from '@/pack';
import { listVersions, restoreVersion } from '@/restore';
import { openHistoryStores, readPending } from '@/store';
import { ingestEdit } from '@/wal';
import { expect, test } from 'bun:test';
import { openMemoryDB } from 'uni-kv';
import type { RemoteHistory } from '@/remote';
import type { HistoryDatabase } from '@/store';

const encoder = new TextEncoder();

function fakeRemote() {
	const objects = new Map<string, Uint8Array>();
	const remote: RemoteHistory = {
		deletePack: () => Promise.resolve(),
		deviceId: 'device-a',
		fs: {} as never,
		getObject: (key) => {
			const value = objects.get(key);
			return value ? Promise.resolve(value) : Promise.reject(new Error(`missing ${key}`));
		},
		listHeads: () => Promise.resolve([]),
		listPacks: () => Promise.resolve([]),
		ns: 'ns',
		putBlob: (hash, bytes) => {
			objects.set(`ns/blobs/${hash}.blob`, bytes);
			return Promise.resolve();
		},
		putPack: (seq, hash, bytes) => {
			objects.set(`ns/packs/device-a/${packFileName('device-a', seq, hash)}`, bytes);
			return Promise.resolve();
		},
		readHead: () => Promise.resolve(undefined as never),
		writeHead: () => Promise.resolve(),
	};
	return { objects, remote };
}

async function seedVersion(text: string, lamport = 1) {
	const db = openMemoryDB(`history-restore-${crypto.randomUUID()}`) as never as HistoryDatabase;
	const stores = openHistoryStores(db, 'ns');
	const { objects, remote } = fakeRemote();
	const bytes = encoder.encode(text);
	const encoded = await encodePack(
		{
			baseLamport: lamport,
			createdAt: 1000,
			deviceId: 'device-a',
			ns: 'ns',
			peakLamport: lamport,
			seq: 1,
		},
		[
			{
				at: 1000,
				blobs: [],
				chunks: [],
				deviceId: 'device-a',
				flags: 1,
				inlineLength: bytes.byteLength,
				inlineOffset: 0,
				key: 'note.md',
				keyHash: await keyHash('note.md'),
				lamport,
				parents: [],
			},
		],
		bytes,
	);
	const fileName = packFileName('device-a', 1, encoded.header.hash);
	objects.set(`ns/packs/device-a/${fileName}`, encoded.bytes);
	await stores.index.set(`note.md@${lamport}`, {
		indexLength: encoded.header.indexLength,
		indexOffset: encoded.header.indexOffset,
		pack: {
			deviceId: 'device-a',
			fromLamport: lamport,
			hash: encoded.header.hash,
			seq: 1,
			toLamport: lamport,
		},
	});
	return { remote, stores };
}

test('restoreVersion reads the pack and returns the exact text', async () => {
	const { remote, stores } = await seedVersion('# Restored text');
	const result = await restoreVersion({ remote, stores }, { key: 'note.md', lamport: 1 });
	expect(result.text).toBe('# Restored text');
	expect(result.key).toBe('note.md');
	expect(result.merged).toBe(false);
});

test('listVersions returns the captured lamports for a key', async () => {
	const { remote, stores } = await seedVersion('one', 1);
	const location = await stores.index.get('note.md@1');
	if (location) await stores.index.set('note.md@2', location);
	const versions = await listVersions({ remote, stores }, 'note.md');
	expect(versions.map((version) => version.lamport)).toStrictEqual([2, 1]);
});

test('restoreVersion refreshes heads on an index miss before giving up', async () => {
	const { remote, stores } = await seedVersion('one', 1);
	let headRefreshes = 0;
	const original = remote.listHeads;
	remote.listHeads = () => {
		headRefreshes++;
		return original();
	};
	let threw = false;
	try {
		await restoreVersion({ remote, stores }, { key: 'missing.md', lamport: 1 });
	} catch {
		threw = true;
	}
	expect(threw).toBe(true);
	expect(headRefreshes).toBeGreaterThan(0);
});

test('a DAG fork restores into a new merge commit with both tips as parents', async () => {
	const db = openMemoryDB(`history-dag-${crypto.randomUUID()}`) as never as HistoryDatabase;
	const stores = openHistoryStores(db, 'ns');
	const { objects, remote } = fakeRemote();
	const kh = await keyHash('note.md');
	const make = (lamport: number, parents: Array<string>) => ({
		at: 1000,
		blobs: [],
		chunks: [],
		deviceId: 'device-a',
		flags: 1 as const,
		inlineLength: 0,
		inlineOffset: 0,
		key: 'note.md',
		keyHash: kh,
		lamport,
		parents,
	});
	const entries = [make(1, []), make(2, []), make(3, ['note.md@1', 'note.md@2'])];
	const encoded = await encodePack(
		{ baseLamport: 1, createdAt: 1000, deviceId: 'device-a', ns: 'ns', peakLamport: 3, seq: 1 },
		entries,
		new Uint8Array(0),
	);
	const pack = {
		deviceId: 'device-a',
		fromLamport: 1,
		hash: encoded.header.hash,
		seq: 1,
		toLamport: 3,
	};
	objects.set(`ns/packs/device-a/${packFileName('device-a', 1, pack.hash)}`, encoded.bytes);
	for (const lamport of [1, 2, 3])
		await stores.index.set(`note.md@${lamport}`, {
			indexLength: encoded.header.indexLength,
			indexOffset: encoded.header.indexOffset,
			pack,
		});
	const result = await restoreVersion({ remote, stores }, { key: 'note.md', lamport: 3 });
	expect(result.merged).toBe(true);
	const pending = await readPending(stores);
	expect(pending).toHaveLength(1);
	expect(pending[0].parents).toStrictEqual(['note.md@1', 'note.md@2']);
});

test('versions are numbered per file even when a pack batches edits from several files', async () => {
	const db = openMemoryDB(`history-perfile-${crypto.randomUUID()}`) as never as HistoryDatabase;
	const stores = openHistoryStores(db, 'ns');
	const { remote } = fakeRemote();
	const ctx = { remote, requestSync: () => {}, stores };
	// Global Lamport clock: 1 (abcd), 2 (other), 3 (abcd). UI must not show 3 and 1 as "versions".
	await ingestEdit(stores, 'abcd.md', encoder.encode('abcd v1'));
	await ingestEdit(stores, 'other.md', encoder.encode('other v1'));
	await ingestEdit(stores, 'abcd.md', encoder.encode('abcd v2'));
	await flushPending(ctx, 'count');
	const abcd = await listVersions({ remote, stores }, 'abcd.md');
	const other = await listVersions({ remote, stores }, 'other.md');
	// Per-file indices are contiguous starting at 1 (newest first), independent of global lamport.
	expect(abcd.map((version) => version.index)).toStrictEqual([1, 2]);
	expect(abcd.map((version) => version.lamport)).toStrictEqual([3, 1]);
	expect(other.map((version) => version.index)).toStrictEqual([1]);
	expect(other[0].lamport).toBe(2);
	// Restoring never returns another file's content from the same pack.
	const abcdLatest = await restoreVersion({ remote, stores }, { key: 'abcd.md', lamport: 3 });
	const otherOnly = await restoreVersion({ remote, stores }, { key: 'other.md', lamport: 2 });
	expect(abcdLatest.text).toBe('abcd v2');
	expect(otherOnly.text).toBe('other v1');
});

test('a missing version throws instead of falling back to another commit in the pack', async () => {
	const db = openMemoryDB(`history-missing-${crypto.randomUUID()}`) as never as HistoryDatabase;
	const stores = openHistoryStores(db, 'ns');
	const { remote } = fakeRemote();
	await ingestEdit(stores, 'a.md', encoder.encode('a'));
	const ctx = { remote, requestSync: () => {}, stores };
	await flushPending(ctx, 'count');
	// Point a lookup at a lamport that is not in the pack; the old entries[0] fallback would
	// silently return a.md's content. It must now fail loudly.
	const location = await stores.index.get('a.md@1');
	if (location) await stores.index.set('a.md@999', location);
	let threw = false;
	try {
		await restoreVersion({ remote, stores }, { key: 'a.md', lamport: 999 });
	} catch {
		threw = true;
	}
	expect(threw).toBe(true);
});
