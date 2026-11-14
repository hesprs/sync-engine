import { keyHash } from '@/chunker';
import { compact } from '@/gc';
import { buildCommitLog } from '@/head-log';
import { encodePack, packFileName } from '@/pack';
import { openHistoryStores } from '@/store';
import { expect, test } from 'bun:test';
import { openMemoryDB } from 'uni-kv';
import type { RemoteHistory } from '@/remote';
import type { HistoryDatabase } from '@/store';

const encoder = new TextEncoder();

function setup() {
	const db = openMemoryDB(`history-gc-${crypto.randomUUID()}`) as never as HistoryDatabase;
	const stores = openHistoryStores(db, 'ns');
	const objects = new Map<string, Uint8Array>();
	const deleted: Array<string> = [];
	const deletedCalls: Array<{ deviceId: string; fileName: string }> = [];
	const put: Array<string> = [];
	const remote: RemoteHistory = {
		deletePack: (deviceId, fileName) => {
			deleted.push(fileName);
			deletedCalls.push({ deviceId, fileName });
			return Promise.resolve();
		},
		deviceId: 'device-a',
		fs: {} as never,
		getObject: (key) => {
			const value = objects.get(key);
			return value ? Promise.resolve(value) : Promise.reject(new Error(`missing ${key}`));
		},
		listHeads: () => Promise.resolve([]),
		listPacks: () => Promise.resolve([]),
		ns: 'ns',
		putBlob: () => Promise.resolve(),
		putPack: (_seq, hash) => {
			put.push(hash);
			return Promise.resolve();
		},
		readHead: () => Promise.resolve(undefined as never),
		writeHead: () => Promise.resolve(),
	};
	return { deleted, deletedCalls, objects, put, remote, stores };
}

async function seed(
	setupReturn: ReturnType<typeof setup>,
	text: string,
	at: number,
	options: { deviceId?: string; key?: string; lamport?: number; seq?: number } = {},
) {
	const { objects, stores } = setupReturn;
	const deviceId = options.deviceId ?? 'device-a';
	const key = options.key ?? 'note.md';
	const lamport = options.lamport ?? 1;
	const seq = options.seq ?? 1;
	const bytes = encoder.encode(text);
	const encoded = await encodePack(
		{ baseLamport: lamport, createdAt: at, deviceId, ns: 'ns', peakLamport: lamport, seq },
		[
			{
				at,
				blobs: [],
				chunks: [],
				deviceId,
				flags: 1,
				inlineLength: bytes.byteLength,
				inlineOffset: 0,
				key,
				keyHash: await keyHash(key),
				lamport,
				parents: [],
			},
		],
		bytes,
	);
	const fileName = packFileName(deviceId, seq, encoded.header.hash);
	objects.set(`ns/packs/${deviceId}/${fileName}`, encoded.bytes);
	await stores.index.set(`${key}@${lamport}`, {
		indexLength: encoded.header.indexLength,
		indexOffset: encoded.header.indexOffset,
		pack: {
			deviceId,
			fromLamport: lamport,
			hash: encoded.header.hash,
			seq,
			toLamport: lamport,
		},
	});
	const log = await buildCommitLog({
		chunkIndex: {},
		deviceId,
		generation: 0,
		heads: [],
		ns: 'ns',
		packs: [],
		peakLamport: lamport,
		seq,
		updatedAt: Date.now(),
	});
	await stores.heads.set(deviceId, log);
	return { fileName, hash: encoded.header.hash };
}

test('compact rewrites live versions into a new pack and deletes obsolete packs', async () => {
	const setupReturn = setup();
	await seed(setupReturn, 'live text', Date.now());
	const { deleted, put, remote, stores } = setupReturn;
	const removed = await compact({ remote, stores }, 90);
	expect(put).toHaveLength(1);
	expect(removed).toBe(0); // The seeded pack is still live (within retention).
	expect(deleted).toStrictEqual([]);
});

test('compact never mutates an existing pack in place', async () => {
	const setupReturn = setup();
	const { hash } = await seed(setupReturn, 'live text', Date.now());
	const { put } = setupReturn;
	await compact({ remote: setupReturn.remote, stores: setupReturn.stores }, 90);
	expect(put[0]).not.toBe(hash);
});

test('compact enforces maxVersions per note and removes packs with only pruned versions', async () => {
	const setupReturn = setup();
	const now = Date.now();
	const p1 = await seed(setupReturn, 'v1', now - 3000, { lamport: 1, seq: 1 });
	await seed(setupReturn, 'v2', now - 2000, { lamport: 2, seq: 2 });
	await seed(setupReturn, 'v3', now - 1000, { lamport: 3, seq: 3 });
	const { deleted, remote, stores } = setupReturn;
	const removed = await compact({ remote, stores }, { maxVersions: 2, retentionDays: 90 });
	expect(removed).toBe(1);
	expect(deleted).toContain(p1.fileName);
	expect(await stores.index.get('note.md@1')).toBeUndefined();
	expect(await stores.index.get('note.md@2')).toBeDefined();
	expect(await stores.index.get('note.md@3')).toBeDefined();
});

test('compact supports multi-device packs and deletes with the correct deviceId', async () => {
	const setupReturn = setup();
	const now = Date.now();
	const p1 = await seed(setupReturn, 'v1', now - 3000, {
		deviceId: 'device-b',
		lamport: 1,
		seq: 1,
	});
	await seed(setupReturn, 'v2', now - 2000, { deviceId: 'device-a', lamport: 2, seq: 2 });
	await seed(setupReturn, 'v3', now - 1000, { deviceId: 'device-a', lamport: 3, seq: 3 });
	const { deletedCalls, remote, stores } = setupReturn;
	const removed = await compact({ remote, stores }, { maxVersions: 2, retentionDays: 90 });
	expect(removed).toBe(1);
	expect(deletedCalls).toContainEqual({ deviceId: 'device-b', fileName: p1.fileName });
	expect(await stores.index.get('note.md@1')).toBeUndefined();
	expect(await stores.index.get('note.md@2')).toBeDefined();
});

test('compact tolerates remote missing packs (NoSuchKey) and cleans up stale index entries', async () => {
	const setupReturn = setup();
	const now = Date.now();
	const ghost = await seed(setupReturn, 'ghost', now - 3000, {
		key: 'ghost.md',
		lamport: 1,
		seq: 1,
	});
	setupReturn.objects.delete(`ns/packs/device-a/${ghost.fileName}`);
	await seed(setupReturn, 'live', now - 1000, { key: 'live.md', lamport: 2, seq: 2 });
	const { remote, stores } = setupReturn;
	const removed = await compact({ remote, stores }, { maxVersions: 10, retentionDays: 90 });
	expect(removed).toBe(1);
	expect(await stores.index.get('ghost.md@1')).toBeUndefined();
	expect(await stores.index.get('live.md@2')).toBeDefined();
});

test('compact tolerates deletePack failure (NoSuchKey) when pack is already deleted', async () => {
	const setupReturn = setup();
	const now = Date.now();
	await seed(setupReturn, 'v1', now - 3000, { lamport: 1, seq: 1 });
	await seed(setupReturn, 'v2', now - 2000, { lamport: 2, seq: 2 });
	await seed(setupReturn, 'v3', now - 1000, { lamport: 3, seq: 3 });
	const { remote, stores } = setupReturn;
	remote.deletePack = () => Promise.reject(new Error('S3 NoSuchKey: missing key'));
	const removed = await compact({ remote, stores }, { maxVersions: 2, retentionDays: 90 });
	expect(removed).toBe(0);
});

test('compact with tiered retention preserves older daily versions even when same-day burst exceeds maxVersions', async () => {
	const setupReturn = setup();
	const now = Date.now();
	const dayMs = 86_400_000;
	// 1 version 10 days ago
	await seed(setupReturn, 'v-10d', now - 10 * dayMs, { lamport: 1, seq: 1 });
	// 1 version yesterday
	await seed(setupReturn, 'v-yesterday', now - dayMs, { lamport: 2, seq: 2 });
	// 5 rapid edits today (within last 10 minutes)
	for (let i = 0; i < 5; i++)
		await seed(setupReturn, `v-today-${i}`, now - 600_000 + i * 1000, {
			lamport: 3 + i,
			seq: 3 + i,
		});

	const { remote, stores } = setupReturn;
	await compact({ remote, stores }, { maxVersions: 3, now, retentionDays: 90, tiered: true });

	// Historical versions MUST survive despite the burst of edits today
	expect(await stores.index.get('note.md@1')).toBeDefined();
	expect(await stores.index.get('note.md@2')).toBeDefined();
	// The newest version from today is kept
	expect(await stores.index.get('note.md@7')).toBeDefined();
	// Older versions from today are pruned to respect maxVersions budget
	expect(await stores.index.get('note.md@3')).toBeUndefined();
	expect(await stores.index.get('note.md@4')).toBeUndefined();
	expect(await stores.index.get('note.md@5')).toBeUndefined();
	expect(await stores.index.get('note.md@6')).toBeUndefined();
});

test('compact with tiered retention thins multiple edits on past days down to 1 milestone per day', async () => {
	const setupReturn = setup();
	const now = Date.now();
	const dayMs = 86_400_000;
	// 3 versions from 3 days ago (e.g. morning, afternoon, evening)
	await seed(setupReturn, 'v-3d-morning', now - 3 * dayMs - 3_600_000, { lamport: 1, seq: 1 });
	await seed(setupReturn, 'v-3d-afternoon', now - 3 * dayMs - 1_800_000, { lamport: 2, seq: 2 });
	await seed(setupReturn, 'v-3d-evening', now - 3 * dayMs, { lamport: 3, seq: 3 });
	// 1 version today
	await seed(setupReturn, 'v-today', now - 1000, { lamport: 4, seq: 4 });

	const { remote, stores } = setupReturn;
	await compact({ remote, stores }, { maxVersions: 10, now, retentionDays: 90, tiered: true });

	// The latest version of 3 days ago is kept as the daily milestone
	expect(await stores.index.get('note.md@3')).toBeDefined();
	// Intermediate edits from 3 days ago are thinned out
	expect(await stores.index.get('note.md@1')).toBeUndefined();
	expect(await stores.index.get('note.md@2')).toBeUndefined();
	// Today's version is kept
	expect(await stores.index.get('note.md@4')).toBeDefined();
});

test('compact with tiered: false falls back to flat newest-first pruning', async () => {
	const setupReturn = setup();
	const now = Date.now();
	const dayMs = 86_400_000;
	await seed(setupReturn, 'v-10d', now - 10 * dayMs, { lamport: 1, seq: 1 });
	await seed(setupReturn, 'v-yesterday', now - dayMs, { lamport: 2, seq: 2 });
	for (let i = 0; i < 5; i++)
		await seed(setupReturn, `v-today-${i}`, now - 600_000 + i * 1000, {
			lamport: 3 + i,
			seq: 3 + i,
		});

	const { remote, stores } = setupReturn;
	await compact({ remote, stores }, { maxVersions: 3, now, retentionDays: 90, tiered: false });

	// In flat mode, the 3 newest versions are kept, crowding out older history
	expect(await stores.index.get('note.md@1')).toBeUndefined();
	expect(await stores.index.get('note.md@2')).toBeUndefined();
	expect(await stores.index.get('note.md@5')).toBeDefined();
	expect(await stores.index.get('note.md@6')).toBeDefined();
	expect(await stores.index.get('note.md@7')).toBeDefined();
});
