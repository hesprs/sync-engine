import {
	bumpLamport,
	getOrCreateDeviceId,
	openHistoryStores,
	readDeviceId,
	readLamport,
	readLastGcTime,
	saveLastGcTime,
} from '@/store';
import { expect, test } from 'bun:test';
import { openMemoryDB } from 'uni-kv';
import type { HistoryDatabase } from '@/store';

function setup(namespace = 'ns-test') {
	const db = openMemoryDB(`history-${crypto.randomUUID()}`) as never as HistoryDatabase;
	return openHistoryStores(db, namespace);
}

test('getOrCreateDeviceId generates and persists a fresh UUID when empty', async () => {
	const stores = setup();
	expect(await readDeviceId(stores)).toBeUndefined();

	const id = await getOrCreateDeviceId(stores);
	expect(typeof id).toBe('string');
	expect(id.length).toBeGreaterThan(10);

	// Subsequent reads and calls return the same ID
	expect(await readDeviceId(stores)).toBe(id);
	expect(await getOrCreateDeviceId(stores)).toBe(id);
});

test('getOrCreateDeviceId migrates legacy deviceId when none exists', async () => {
	const stores = setup();
	const id = await getOrCreateDeviceId(stores, 'legacy-uuid-123');
	expect(id).toBe('legacy-uuid-123');
	expect(await readDeviceId(stores)).toBe('legacy-uuid-123');

	// Ignores legacy parameter once an ID is already stored
	expect(await getOrCreateDeviceId(stores, 'ignored-legacy')).toBe('legacy-uuid-123');
});

test('readLastGcTime defaults to 0 and saveLastGcTime persists the timestamp', async () => {
	const stores = setup();
	expect(await readLastGcTime(stores)).toBe(0);

	const timestamp = 1_700_000_000_000;
	await saveLastGcTime(stores, timestamp);
	expect(await readLastGcTime(stores)).toBe(timestamp);
});

test('stores for different namespaces are isolated', async () => {
	const db = openMemoryDB(`history-${crypto.randomUUID()}`) as never as HistoryDatabase;
	const storesA = openHistoryStores(db, 'ns-a');
	const storesB = openHistoryStores(db, 'ns-b');

	await getOrCreateDeviceId(storesA, 'device-a');
	await saveLastGcTime(storesA, 111);

	expect(await readDeviceId(storesA)).toBe('device-a');
	expect(await readLastGcTime(storesA)).toBe(111);

	expect(await readDeviceId(storesB)).toBeUndefined();
	expect(await readLastGcTime(storesB)).toBe(0);
});

test('clock, device id and GC time coexist in the shared meta store', async () => {
	const stores = setup();
	await bumpLamport(stores, 10);
	await getOrCreateDeviceId(stores, 'device-x');
	await saveLastGcTime(stores, 999);

	expect(await readLamport(stores)).toBe(11);
	expect(await readDeviceId(stores)).toBe('device-x');
	expect(await readLastGcTime(stores)).toBe(999);
	expect(await stores.meta.keys()).toStrictEqual(['clock', 'id', 'time']);
});

test('store names lead with the namespace id so a pair is manageable by prefix', () => {
	const db = openMemoryDB(`history-${crypto.randomUUID()}`);
	openHistoryStores(db as never as HistoryDatabase, 'ns-a');
	const names = db.getStoreNames();
	expect(names).toStrictEqual([
		'ns-a-history-blobs',
		'ns-a-history-chunks',
		'ns-a-history-hashes',
		'ns-a-history-heads',
		'ns-a-history-index',
		'ns-a-history-meta',
		'ns-a-history-pending',
	]);
});
