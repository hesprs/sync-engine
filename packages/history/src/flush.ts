import { keyHash } from '@/chunker';
import { buildCommitLog } from '@/head-log';
import { markChunks, packRefKey, putCommitLocation } from '@/index-store';
import { decodePack, encodePack, packFileName, textBytes } from '@/pack';
import { blobPresent, bumpLamport, clearPending, markBlobs, readPending } from '@/store';
import { FLAG_DELETION, FLAG_SMALL_FILE } from '@/types';
import { sha256Bytes, sha256Text } from '@repo/shared/sha256-bytes';
import type { RemoteHistory } from '@/remote';
import type { HistoryStores } from '@/store';
import type { BlobRef, ChunkLocation, CommitLog, IndexEntry, PackRef, WalEntry } from '@/types';

const MAX_PACK_WINDOW = 32;
const IDLE_MS = 30_000;
const MAX_REVISIONS = 20;
const MAX_BYTES = 256 * 1024;
const FAST_DEBOUNCE_MS = 1000;

export type FlushContext = {
	stores: HistoryStores;
	remote: RemoteHistory;
	requestSync: (trigger: string) => void;
	onFlushError?: (error: Error) => void;
};

type Assembled = {
	entries: Array<IndexEntry>;
	payload: Uint8Array;
	packRef: PackRef;
	wal: Array<WalEntry>;
	chunkLocations: Array<{ hash: string; location: ChunkLocation }>;
	blobBytes: Array<{ hash: string; bytes: Uint8Array }>;
	blobRefs: Array<BlobRef>;
};

function uint8Concat(parts: Array<Uint8Array>): Uint8Array {
	let total = 0;
	for (const part of parts) total += part.byteLength;
	const out = new Uint8Array(total);
	let offset = 0;
	for (const part of parts) {
		out.set(part, offset);
		offset += part.byteLength;
	}
	return out;
}

/** Assembles one immutable pack from a snapshot of pending WAL entries. */
async function assemble(ctx: FlushContext, wal: Array<WalEntry>, seq: number): Promise<Assembled> {
	const { deviceId } = ctx.remote;
	const payloadParts: Array<Uint8Array> = [];
	const entries: Array<IndexEntry> = [];
	const chunkLocations: Array<{ hash: string; location: ChunkLocation }> = [];
	const blobBytes: Array<{ hash: string; bytes: Uint8Array }> = [];
	const blobRefs: Array<BlobRef> = [];
	const packRefBase = { deviceId, fromLamport: 0, hash: '', seq, toLamport: 0 };
	let offset = 0;

	for (const entry of wal) {
		const indexEntry: IndexEntry = {
			at: entry.at,
			blobs: entry.blobs ?? [],
			chunks: [],
			deviceId,
			flags: entry.flags ?? 0,
			key: entry.key,
			keyHash: await keyHash(entry.key),
			lamport: entry.lamport,
			parents: entry.parents ?? (entry.parent ? [entry.parent] : []),
		};
		if (entry.text !== undefined) {
			const bytes = textBytes(entry.text);
			payloadParts.push(bytes);
			indexEntry.inlineOffset = offset;
			indexEntry.inlineLength = bytes.byteLength;
			indexEntry.flags |= FLAG_SMALL_FILE;
			indexEntry.hash = await sha256Bytes(bytes);
			offset += bytes.byteLength;
		} else if (entry.chunkHashes) {
			indexEntry.hash = await sha256Text(entry.chunkHashes.join(','));
			const newByHash = new Map((entry.newChunks ?? []).map((c) => [c.hash, c.bytes]));
			for (const hash of entry.chunkHashes) {
				const bytes = newByHash.get(hash);
				if (bytes) {
					payloadParts.push(bytes);
					indexEntry.chunks.push({ hash, length: bytes.byteLength, offset });
					chunkLocations.push({
						hash,
						location: { length: bytes.byteLength, offset, pack: packRefBase },
					});
					offset += bytes.byteLength;
				} else
					// Already present remotely; restore resolves it through the chunk index by hash.
					indexEntry.chunks.push({ hash, length: 0, offset: -1 });
			}
		} else if (entry.blobs && entry.blobs.length > 0)
			indexEntry.hash = await sha256Text(entry.blobs.map((b) => b.hash).join(','));
		else if ((entry.flags ?? 0) & FLAG_DELETION) indexEntry.hash = '<deleted>';
		for (const blob of entry.blobData ?? []) blobBytes.push(blob);
		for (const blob of entry.blobs ?? []) blobRefs.push(blob);
		entries.push(indexEntry);
	}

	const lamports = wal.map((entry) => entry.lamport);
	const packRef: PackRef = {
		...packRefBase,
		fromLamport: Math.min(...lamports),
		toLamport: Math.max(...lamports),
	};
	// Fill the real hash into every chunk location and the pack ref after encodePack returns it.
	return {
		blobBytes,
		blobRefs,
		chunkLocations,
		entries,
		packRef: { ...packRef, hash: '' },
		payload: uint8Concat(payloadParts),
		wal,
	};
}

async function currentLog(ctx: FlushContext): Promise<CommitLog> {
	const local = await ctx.stores.heads.get(ctx.remote.deviceId);
	if (local) return local;
	const remote = await ctx.remote.readHead(ctx.remote.deviceId);
	if (remote) return remote;
	return buildCommitLog({
		chunkIndex: {},
		deviceId: ctx.remote.deviceId,
		generation: 0,
		heads: [],
		ns: ctx.remote.ns,
		packs: [],
		peakLamport: 0,
		seq: 0,
		updatedAt: Date.now(),
	});
}

/** Replays a pending batch into one pack. Ordering is blobs → pack → head → WAL commit. */
export async function flushPending(ctx: FlushContext, reason: string): Promise<boolean> {
	const wal = await readPending(ctx.stores);
	return flushWal(ctx, wal, reason);
}

/** Bounded flush for lifecycle exit: caps the batch at 256 KiB and leaves the remainder queued. */
export async function flushPendingBatch(
	ctx: FlushContext,
	reason: string,
	maxBytes = MAX_BYTES,
): Promise<boolean> {
	const all = await readPending(ctx.stores);
	const wal: Array<WalEntry> = [];
	let bytes = 0;
	for (const entry of all) {
		const size = (entry.text?.length ?? 0) + (entry.newChunks?.length ?? 0);
		if (wal.length > 0 && bytes + size > maxBytes) break;
		wal.push(entry);
		bytes += size;
	}
	if (wal.length === 0) return false;
	return flushWal(ctx, wal, reason);
}

async function flushWal(
	ctx: FlushContext,
	wal: Array<WalEntry>,
	_reason: string,
): Promise<boolean> {
	if (wal.length === 0) return false;
	const log = await currentLog(ctx);
	const seq = log.seq + 1;
	const assembled = await assemble(ctx, wal, seq);

	const encoded = await encodePack(
		{
			baseLamport: assembled.packRef.fromLamport,
			// Deterministic: replaying the same batch must reproduce identical bytes.
			createdAt: Math.max(...wal.map((entry) => entry.at)),
			deviceId: ctx.remote.deviceId,
			ns: ctx.remote.ns,
			peakLamport: assembled.packRef.toLamport,
			seq,
		},
		assembled.entries,
		assembled.payload,
	);
	// `hash` is only known after encode; patch the pack ref and chunk locations.
	const realRef: PackRef = { ...assembled.packRef, hash: encoded.header.hash };
	for (const location of assembled.chunkLocations) location.location.pack = realRef;

	// 1. Blobs (content-addressed, idempotent). Skip ones already confirmed present locally.
	for (const blob of assembled.blobBytes)
		if (blob.bytes.byteLength && !(await blobPresent(ctx.stores, blob.hash)))
			await ctx.remote.putBlob(blob.hash, blob.bytes);
	// 2. Pack (immutable, idempotent; identical bytes on replay).
	await ctx.remote.putPack(seq, encoded.header.hash, encoded.bytes);
	// 3. Head log (single writer; only this device writes its own log).
	const nextLog = await buildCommitLog({
		chunkIndex: { ...log.chunkIndex },
		deviceId: ctx.remote.deviceId,
		generation: log.generation + 1,
		heads: assembled.entries.map((entry) => `${entry.key}@${entry.lamport}`),
		ns: ctx.remote.ns,
		packs: [...log.packs, realRef].slice(-MAX_PACK_WINDOW),
		peakLamport: Math.max(log.peakLamport, assembled.packRef.toLamport),
		seq,
		updatedAt: Date.now(),
	});
	for (const location of assembled.chunkLocations)
		nextLog.chunkIndex[location.hash] = packRefKey(realRef);
	await ctx.remote.writeHead(nextLog);
	await ctx.stores.heads.set(ctx.remote.deviceId, nextLog);
	// 4. Local index + WAL commit (last; everything before is replayable).
	for (const entry of assembled.entries)
		await putCommitLocation(ctx.stores, `${entry.key}@${entry.lamport}`, {
			indexLength: encoded.header.indexLength,
			indexOffset: encoded.header.indexOffset,
			pack: realRef,
		});
	await markChunks(ctx.stores, assembled.chunkLocations);
	await markBlobs(ctx.stores, assembled.blobRefs);
	await clearPending(ctx.stores, wal);
	return true;
}

/** Rebuilds the version and chunk indexes from one decoded pack. */
async function indexPack(
	ctx: FlushContext,
	ref: PackRef,
	header: { indexLength: number; indexOffset: number },
	entries: Array<IndexEntry>,
): Promise<void> {
	for (const entry of entries)
		await putCommitLocation(ctx.stores, `${entry.key}@${entry.lamport}`, {
			indexLength: header.indexLength,
			indexOffset: header.indexOffset,
			pack: ref,
		});
	const locations = entries.flatMap((entry) =>
		entry.chunks
			.filter((chunk) => chunk.offset >= 0)
			.map((chunk) => ({
				hash: chunk.hash,
				location: { length: chunk.length, offset: chunk.offset, pack: ref },
			})),
	);
	await markChunks(ctx.stores, locations);
}

/** Reads a pack by its reference and indexes it. */
async function indexPackByRef(ctx: FlushContext, ref: PackRef): Promise<void> {
	const bytes = await ctx.remote.getObject(
		`${ctx.remote.ns}/packs/${ref.deviceId}/${packFileName(ref.deviceId, ref.seq, ref.hash)}`,
	);
	const decoded = await decodePack(bytes);
	await indexPack(ctx, ref, decoded.header, decoded.entries);
}

/**
 * Cold-start reconciliation.
 *
 * 1. Replay any pending WAL.
 * 2. LIST heads/ once, read each head log, mirror it locally, and fold its peak Lamport into the local
 *    clock so future edits are ordered after every observed remote commit.
 * 3. For each device with newer commits, LIST packs/<deviceId>/ once and promote orphan packs (written
 *    but never recorded in the head log) using the self-certifying seq+hash in the filename.
 * 4. Rebuild the index and chunk stores only from newly observed packs, skipping packs that were
 *    already indexed under previous generations.
 */
const inFlightReconciles = new Map<string, Promise<void>>();

export async function reconcile(ctx: FlushContext): Promise<void> {
	const key = `${ctx.remote.ns}:${ctx.remote.deviceId}`;
	const active = inFlightReconciles.get(key);
	if (active) return active;
	const promise = runReconcile(ctx).finally(() => inFlightReconciles.delete(key));
	inFlightReconciles.set(key, promise);
	return promise;
}

async function runReconcile(ctx: FlushContext): Promise<void> {
	await flushPending(ctx, 'cold-start');
	const headIds = await ctx.remote.listHeads();
	let seenLamport = 0;
	const logsToReconcile: Array<{ cached?: CommitLog; log: CommitLog }> = [];
	for (const headId of headIds) {
		const cached = await ctx.stores.heads.get(headId);
		if (headId === ctx.remote.deviceId && cached) {
			seenLamport = Math.max(seenLamport, cached.peakLamport);
			continue;
		}
		const log = await ctx.remote.readHead(headId);
		if (!log) continue;
		seenLamport = Math.max(seenLamport, log.peakLamport);
		if (cached && cached.generation >= log.generation) continue;

		logsToReconcile.push({ cached, log });
	}
	if (seenLamport > 0) await bumpLamport(ctx.stores, seenLamport);

	for (const { cached, log } of logsToReconcile) {
		const cachedPackKeys = new Set(
			cached?.packs.map((pack) => `${pack.deviceId}:${pack.seq}:${pack.hash}`),
		);
		const known = new Set(
			log.packs.map((pack) => packFileName(pack.deviceId, pack.seq, pack.hash)),
		);
		for (const fileName of await ctx.remote.listPacks(log.deviceId)) {
			if (known.has(fileName)) continue;
			// An orphan pack is self-certifying: seq + hash in the name are enough to index it.
			const bytes = await ctx.remote.getObject(
				`${ctx.remote.ns}/packs/${log.deviceId}/${fileName}`,
			);
			const decoded = await decodePack(bytes);
			const orphanRef: PackRef = {
				deviceId: decoded.header.deviceId,
				fromLamport: decoded.header.baseLamport,
				hash: decoded.header.hash,
				seq: decoded.header.seq,
				toLamport: decoded.header.peakLamport,
			};
			await indexPack(ctx, orphanRef, decoded.header, decoded.entries);
		}
		for (const ref of log.packs) {
			if (cachedPackKeys.has(`${ref.deviceId}:${ref.seq}:${ref.hash}`)) continue;
			await indexPackByRef(ctx, ref);
		}
		await ctx.stores.heads.set(log.deviceId, log);
	}
}

export class FlushScheduler {
	private lastEdit = 0;
	private pendingBytes = 0;
	private pendingRevisions = 0;
	private idleTimer?: ReturnType<typeof setTimeout>;
	private fastTimer?: ReturnType<typeof setTimeout>;
	private flushing = false;

	constructor(private readonly ctx: FlushContext) {}

	/** Called on every captured edit. Fast channel and flush predicates are independent. */
	onEdit(size: number): void {
		this.lastEdit = Date.now();
		this.pendingBytes += size;
		this.pendingRevisions += 1;
		// Fast channel: a thin 1s debounce that only asks the sync core to upload the live note.
		if (this.fastTimer) clearTimeout(this.fastTimer);
		this.fastTimer = setTimeout(() => this.ctx.requestSync('realtime'), FAST_DEBOUNCE_MS);
		if (this.idleTimer) clearTimeout(this.idleTimer);
		this.idleTimer = setTimeout(() => void this.trigger('idle'), IDLE_MS);
		if (this.pendingRevisions >= MAX_REVISIONS || this.pendingBytes >= MAX_BYTES)
			void this.trigger(this.pendingRevisions >= MAX_REVISIONS ? 'count' : 'volume');
	}

	async trigger(reason: string): Promise<void> {
		if (this.flushing) return;
		this.flushing = true;
		try {
			await flushPending(this.ctx, reason);
			this.pendingBytes = 0;
			this.pendingRevisions = 0;
		} catch (error) {
			// WAL entries stay pending; the next trigger replays the same bytes idempotently.
			this.ctx.onFlushError?.(error instanceof Error ? error : new Error(String(error)));
		} finally {
			this.flushing = false;
		}
	}

	/** Best-effort last chance before exit; caps the batch and leaves the remainder queued. */
	async onUnload(): Promise<void> {
		if (this.fastTimer) clearTimeout(this.fastTimer);
		if (this.idleTimer) clearTimeout(this.idleTimer);
		try {
			await flushPendingBatch(this.ctx, 'lifecycle');
		} catch (error) {
			this.ctx.onFlushError?.(error instanceof Error ? error : new Error(String(error)));
		}
	}

	dispose(): void {
		if (this.fastTimer) clearTimeout(this.fastTimer);
		if (this.idleTimer) clearTimeout(this.idleTimer);
	}
}
