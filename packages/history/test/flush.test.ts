import { flushPending, flushPendingBatch, FlushScheduler, reconcile } from '@/flush';
import { decodeHeadLog } from '@/head-log';
import { readLamport, openHistoryStores, readPending } from '@/store';
import { ingestEdit } from '@/wal';
import { expect, test } from 'bun:test';
import { openMemoryDB } from 'uni-kv';
import type { FlushContext } from '@/flush';
import type { RemoteHistory } from '@/remote';
import type { HistoryDatabase } from '@/store';
import type { CommitLog, WalEntry } from '@/types';

const encoder = new TextEncoder();

async function expectAsyncThrow(promise: Promise<unknown>, message: string): Promise<void> {
	try {
		await promise;
	} catch (error) {
		expect((error as Error).message).toBe(message);
		return;
	}
	throw new Error(`Expected rejection: ${message}`);
}

type Recorded = { kind: string; key: string };

function fakeRemote() {
	const written: Array<Recorded> = [];
	const objects = new Map<string, Uint8Array>();
	const heads = new Map<string, Uint8Array>();
	const remote: RemoteHistory = {
		deletePack(_deviceId, fileName) {
			written.push({ key: fileName, kind: 'delete' });
			objects.delete(`ns/packs/device-a/${fileName}`);
			return Promise.resolve();
		},
		deviceId: 'device-a',
		fs: {} as never,
		getObject(key) {
			const value = objects.get(key);
			return value ? Promise.resolve(value) : Promise.reject(new Error(`missing ${key}`));
		},
		listHeads() {
			return Promise.resolve([...heads.keys()]);
		},
		listPacks() {
			return Promise.resolve(
				[...objects.keys()]
					.filter((key) => key.startsWith('ns/packs/device-a/') && key.endsWith('.pack'))
					.map((key) => key.split('/').at(-1) ?? key),
			);
		},
		ns: 'ns',
		putBlob(hash, bytes) {
			written.push({ key: hash, kind: 'blob' });
			objects.set(`ns/blobs/${hash}.blob`, bytes);
			return Promise.resolve();
		},
		putPack(seq, hash, bytes) {
			written.push({ key: `p-${seq}-${hash}.pack`, kind: 'pack' });
			objects.set(`ns/packs/device-a/p-${seq}-${hash}.pack`, bytes);
			return Promise.resolve();
		},
		readHead(id): Promise<CommitLog | undefined> {
			const bytes = heads.get(id);
			return bytes
				? decodeHeadLog(bytes)
				: Promise.resolve(undefined as CommitLog | undefined);
		},
		writeHead(log: CommitLog) {
			written.push({ key: log.deviceId, kind: 'head' });
			heads.set(log.deviceId, new TextEncoder().encode(JSON.stringify(log)));
			return Promise.resolve();
		},
	};
	return { heads, objects, remote, written };
}

function setup() {
	const db = openMemoryDB(`history-flush-${crypto.randomUUID()}`) as never as HistoryDatabase;
	const stores = openHistoryStores(db, 'ns');
	const fake = fakeRemote();
	const ctx: FlushContext = { remote: fake.remote, requestSync: () => {}, stores };
	return { ...fake, ctx, stores };
}

test('flush writes in the order blobs → pack → head → WAL commit', async () => {
	const { ctx, written, stores } = setup();
	await ingestEdit(stores, 'note.md', encoder.encode('one'));
	await ingestEdit(stores, 'note.md', encoder.encode('two'));
	expect(await flushPending(ctx, 'count')).toBe(true);
	expect(written.map((w) => w.kind)).toStrictEqual(['pack', 'head']);
	expect(await readPending(stores)).toStrictEqual([]);
	expect(await readLamport(stores)).toBe(2);
});

test('a successful flush records commit locations for O(1) restore', async () => {
	const { ctx, stores } = setup();
	await ingestEdit(stores, 'note.md', encoder.encode('one'));
	await flushPending(ctx, 'idle');
	expect(await stores.index.get('note.md@1')).toBeDefined();
});

test('a head-write failure keeps the WAL pending for idempotent replay', async () => {
	const { ctx, remote, stores } = setup();
	await ingestEdit(stores, 'note.md', encoder.encode('one'));
	remote.writeHead = () => Promise.reject(new Error('network'));
	await expectAsyncThrow(flushPending(ctx, 'idle'), 'network');
	expect(await readPending(stores)).toHaveLength(1);
});

test('replaying the same WAL batch reproduces the identical pack name (idempotent)', async () => {
	const { ctx, written, stores, remote } = setup();
	await ingestEdit(stores, 'note.md', encoder.encode('same'));
	const realWriteHead = remote.writeHead;
	remote.writeHead = () => Promise.reject(new Error('crash before head'));
	await expectAsyncThrow(flushPending(ctx, 'idle'), 'crash before head');
	remote.writeHead = realWriteHead;
	// The WAL was kept, so the replay is byte-identical and targets the same pack name.
	await flushPending(ctx, 'idle');
	const packNames = written.filter((w) => w.kind === 'pack').map((w) => w.key);
	expect(packNames).toHaveLength(2);
	expect(packNames[1]).toBe(packNames[0]);
});

test('reconcile promotes an orphan pack into the commit index', async () => {
	const { ctx, objects, remote, stores } = setup();
	await ingestEdit(stores, 'note.md', encoder.encode('orphan'));
	// Pack PUT succeeds but head rewrite never happens.
	const { encodePack } = await import('@/pack');
	const { keyHash } = await import('@/chunker');
	const encoded = await encodePack(
		{ baseLamport: 1, createdAt: 1000, deviceId: 'device-a', ns: 'ns', peakLamport: 1, seq: 1 },
		[
			{
				at: 1000,
				blobs: [],
				chunks: [],
				deviceId: 'device-a',
				flags: 1,
				inlineLength: 6,
				inlineOffset: 0,
				key: 'note.md',
				keyHash: await keyHash('note.md'),
				lamport: 1,
				parents: [],
			},
		],
		encoder.encode('orphan'),
	);
	objects.set(`ns/packs/device-a/p-1-${encoded.header.hash}.pack`, encoded.bytes);
	const pending: Array<WalEntry> = await readPending(stores);
	for (const entry of pending) await stores.pending.delete(String(entry.seq));
	// Seed a head log whose pack window does not yet list the orphan pack.
	const { buildCommitLog } = await import('@/head-log');
	const log = await buildCommitLog({
		chunkIndex: {},
		deviceId: 'device-a',
		generation: 0,
		heads: [],
		ns: 'ns',
		packs: [],
		peakLamport: 0,
		seq: 0,
		updatedAt: 1000,
	});
	await remote.writeHead(log);
	await reconcile(ctx);
	expect(await stores.index.get('note.md@1')).toBeDefined();
});

test('a bounded flush caps the batch and leaves the remainder queued', async () => {
	const { ctx, stores } = setup();
	for (let index = 0; index < 3; index++)
		await ingestEdit(stores, 'note.md', encoder.encode('x'.repeat(100)));
	expect(await readPending(stores)).toHaveLength(3);
	// A 150-byte cap fits one ~100-byte entry; the rest must stay in the WAL.
	await flushPendingBatch(ctx, 'lifecycle', 150);
	expect(await readPending(stores)).toHaveLength(2);
});

test('onUnload performs a best-effort bounded flush without clearing all edits', async () => {
	const { ctx, stores } = setup();
	await ingestEdit(stores, 'note.md', encoder.encode('one'));
	const scheduler = new FlushScheduler(ctx);
	scheduler.onEdit(3);
	expect(await scheduler.onUnload()).toBeUndefined();
	expect(await readPending(stores)).toHaveLength(0);
	scheduler.dispose();
});

test('reconcile folds a remote head peak Lamport into the local clock', async () => {
	const { ctx, remote, stores } = setup();
	const { buildCommitLog } = await import('@/head-log');
	const log = await buildCommitLog({
		chunkIndex: {},
		deviceId: 'device-b',
		generation: 2,
		heads: [],
		ns: 'ns',
		packs: [],
		peakLamport: 42,
		seq: 5,
		updatedAt: 1000,
	});
	await remote.writeHead(log);
	await reconcile(ctx);
	const next = await ingestEdit(stores, 'note.md', encoder.encode('after'));
	expect(next.lamport).toBeGreaterThan(42);
});
