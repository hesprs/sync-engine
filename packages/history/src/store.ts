import type { BlobRef, ChunkLocation, CommitLocation, CommitLog, WalEntry } from '@/types';
import type { DatabaseAsync, StoreAsync } from '@hesprs/sync-engine-sdk';

export type HistoryStoreSchema = Record<string, unknown>;
export type HistoryDatabase = DatabaseAsync<HistoryStoreSchema>;

export type HistoryStores = {
	pending: StoreAsync<WalEntry>;
	chunks: StoreAsync<ChunkLocation>;
	index: StoreAsync<CommitLocation>;
	heads: StoreAsync<CommitLog>;
	blobs: StoreAsync<BlobRef>;
	lamport: StoreAsync<number>;
	hashes: StoreAsync<string>;
};

function store<S extends keyof HistoryStores>(
	db: HistoryDatabase,
	name: `history-${S}-${string}`,
): HistoryStores[S] {
	return db.getStore(name) as HistoryStores[S];
}

/** Opens the namespaced WAL/CAS/head stores. All keys are namespaced by the vault/remote pair. */
export function openHistoryStores(db: HistoryDatabase, namespace: string): HistoryStores {
	return {
		blobs: store(db, `history-blobs-${namespace}`),
		chunks: store(db, `history-chunks-${namespace}`),
		hashes: store(db, `history-hashes-${namespace}`),
		heads: store(db, `history-heads-${namespace}`),
		index: store(db, `history-index-${namespace}`),
		lamport: store(db, `history-lamport-${namespace}`),
		pending: store(db, `history-pending-${namespace}`),
	};
}

const LAMPORT_KEY = 'clock';

/** Reads the persisted Lamport clock, falling back to the WAL's own lamport fields. */
export async function readLamport(stores: HistoryStores, seen = 0): Promise<number> {
	const clock = (await stores.lamport.get(LAMPORT_KEY)) ?? 0;
	const wal = await stores.pending.values();
	let fromWal = 0;
	for (const entry of wal) fromWal = Math.max(fromWal, entry.lamport);
	return Math.max(clock, fromWal, seen);
}

export async function bumpLamport(stores: HistoryStores, seen = 0): Promise<number> {
	const current = (await readLamport(stores, seen)) + 1;
	await stores.lamport.set(LAMPORT_KEY, current);
	return current;
}

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
