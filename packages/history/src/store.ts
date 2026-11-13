import type { BlobRef, ChunkLocation, CommitLocation, CommitLog, WalEntry } from '@/types';
import type { DatabaseAsync, DatabaseSync, StoreAsync } from '@hesprs/sync-engine-sdk';

export type HistoryStoreSchema = Record<string, unknown>;
export type HistoryDatabase = DatabaseAsync<HistoryStoreSchema> | DatabaseSync<HistoryStoreSchema>;

export type HistoryStores = {
	blobs: StoreAsync<BlobRef>;
	chunks: StoreAsync<ChunkLocation>;
	hashes: StoreAsync<string>;
	heads: StoreAsync<CommitLog>;
	index: StoreAsync<CommitLocation>;
	meta: StoreAsync<string | number>;
	pending: StoreAsync<WalEntry>;
};

function store<S extends keyof HistoryStores>(
	db: HistoryDatabase,
	name: `${string}-history-${S}`,
): HistoryStores[S] {
	return db.getStore(name) as HistoryStores[S];
}

/**
 * Opens the WAL/CAS/head stores for one vault/remote pair. The namespace is the leading id so every
 * store of a pair shares a prefix and can be enumerated, migrated or deleted together. Single-value
 * metadata (Lamport clock, device id, last GC time) shares one `meta` store.
 */
export function openHistoryStores(db: HistoryDatabase, namespace: string): HistoryStores {
	return {
		blobs: store(db, `${namespace}-history-blobs`),
		chunks: store(db, `${namespace}-history-chunks`),
		hashes: store(db, `${namespace}-history-hashes`),
		heads: store(db, `${namespace}-history-heads`),
		index: store(db, `${namespace}-history-index`),
		meta: store(db, `${namespace}-history-meta`),
		pending: store(db, `${namespace}-history-pending`),
	};
}

const LAMPORT_KEY = 'clock';
const DEVICE_ID_KEY = 'id';
const GC_TIME_KEY = 'time';
const deviceIdInFlight = new Map<StoreAsync<string | number>, Promise<string>>();

/** Reads the persisted Lamport clock, falling back to the WAL's own lamport fields. */
export async function readLamport(stores: HistoryStores, seen = 0): Promise<number> {
	const clock = await stores.meta.get(LAMPORT_KEY);
	const wal = await stores.pending.values();
	let fromWal = 0;
	for (const entry of wal) fromWal = Math.max(fromWal, entry.lamport);
	return Math.max(typeof clock === 'number' ? clock : 0, fromWal, seen);
}

export async function bumpLamport(stores: HistoryStores, seen = 0): Promise<number> {
	const current = (await readLamport(stores, seen)) + 1;
	await stores.meta.set(LAMPORT_KEY, current);
	return current;
}

/** Retrieves or initializes the local device identifier for this history store. */
export function getOrCreateDeviceId(
	stores: HistoryStores,
	legacyDeviceId?: string,
): Promise<string> {
	const inFlight = deviceIdInFlight.get(stores.meta);
	if (inFlight) return inFlight;
	const promise = (async () => {
		const stored = await stores.meta.get(DEVICE_ID_KEY);
		if (typeof stored === 'string' && stored.length > 0) return stored;
		const id =
			typeof legacyDeviceId === 'string' && legacyDeviceId.length > 0
				? legacyDeviceId
				: crypto.randomUUID();
		await stores.meta.set(DEVICE_ID_KEY, id);
		return id;
	})().finally(() => {
		deviceIdInFlight.delete(stores.meta);
	});
	deviceIdInFlight.set(stores.meta, promise);
	return promise;
}

export async function readDeviceId(stores: HistoryStores): Promise<string | undefined> {
	const value = await stores.meta.get(DEVICE_ID_KEY);
	return typeof value === 'string' ? value : undefined;
}

/** Reads the timestamp of the last history garbage collection. */
export async function readLastGcTime(stores: HistoryStores): Promise<number> {
	const value = await stores.meta.get(GC_TIME_KEY);
	return typeof value === 'number' ? value : 0;
}

/** Persists the timestamp of the last history garbage collection. */
export async function saveLastGcTime(stores: HistoryStores, time: number): Promise<void> {
	await stores.meta.set(GC_TIME_KEY, time);
}

export const getLastGcTime = readLastGcTime;

/**
 * Appends a WAL entry and its Lamport bump together. The entry itself carries the lamport value, so
 * a single pending-store batch is the atomic durability boundary: a kill before it resolves loses
 * the edit (unavoidable), a kill after it resolves never loses it.
 */
export async function appendWal(
	stores: HistoryStores,
	entry: Omit<WalEntry, 'lamport' | 'seq'>,
	seenLamport = 0,
): Promise<WalEntry> {
	const lamport = await bumpLamport(stores, seenLamport);
	const keys = await stores.pending.keys();
	let seq = 0;
	for (const value of keys) seq = Math.max(seq, Number(value) + 1);
	const full: WalEntry = { ...entry, lamport, seq };
	await stores.pending.batch([{ key: String(seq), type: 'set', value: full }]);
	return full;
}

export async function readPending(stores: HistoryStores): Promise<Array<WalEntry>> {
	const entries = await stores.pending.values();
	return entries.sort((a, b) => a.seq - b.seq);
}

/** Deletes WAL entries only after the head log rewrite succeeds. */
export async function clearPending(
	stores: HistoryStores,
	entries: ReadonlyArray<WalEntry>,
): Promise<void> {
	await stores.pending.batch(
		entries.map((entry) => ({ key: String(entry.seq), type: 'delete' as const })),
	);
}

/** Marks attachments as confirmed present so restore can skip refetching them. */
export async function markBlobs(
	stores: HistoryStores,
	blobs: ReadonlyArray<BlobRef>,
): Promise<void> {
	await stores.blobs.batch(
		blobs.map((blob) => ({ key: blob.hash, type: 'set' as const, value: blob })),
	);
}

export async function blobPresent(stores: HistoryStores, hash: string): Promise<boolean> {
	return (await stores.blobs.get(hash)) !== undefined;
}
