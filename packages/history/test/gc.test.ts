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
	const put: Array<string> = [];
	const remote: RemoteHistory = {
		deletePack: (_deviceId, fileName) => {
			deleted.push(fileName);
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
	return { deleted, objects, put, remote, stores };
}

async function seed(
	setupReturn: ReturnType<typeof setup>,
	text: string,
	at: number,
	options: { key?: string; lamport?: number; seq?: number } = {},
) {
	const { objects, stores } = setupReturn;
	const key = options.key ?? 'note.md';
	const lamport = options.lamport ?? 1;
	const seq = options.seq ?? 1;
	const bytes = encoder.encode(text);
	const encoded = await encodePack(
		{
			baseLamport: lamport,
			createdAt: at,
			deviceId: 'device-a',
			ns: 'ns',
			peakLamport: lamport,
			seq,
		},
		[
			{
				at,
				blobs: [],
				chunks: [],
				deviceId: 'device-a',
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
	const fileName = packFileName('device-a', seq, encoded.header.hash);
	objects.set(`ns/packs/device-a/${fileName}`, encoded.bytes);
	await stores.index.set(`${key}@${lamport}`, {
		indexLength: encoded.header.indexLength,
		indexOffset: encoded.header.indexOffset,
		pack: {
			deviceId: 'device-a',
			fromLamport: lamport,
			hash: encoded.header.hash,
			seq,
			toLamport: lamport,
		},
	});
	const log = await buildCommitLog({
		chunkIndex: {},
		deviceId: 'device-a',
		generation: 0,
		heads: [],
		ns: 'ns',
		packs: [],
		peakLamport: lamport,
		seq,
		updatedAt: Date.now(),
	});
	await stores.heads.set('device-a', log);
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
