import { buildCommitLog } from '@/head-log';
import { allChunkLocations, allCommitLocations, markChunks, packRefKey } from '@/index-store';
import { decodePack, encodePack } from '@/pack';
import { FLAG_CHECKPOINT } from '@/types';
import type { RemoteHistory } from '@/remote';
import type { HistoryStores } from '@/store';
import type { ChunkLocation, CommitLog, IndexEntry, PackRef } from '@/types';

export type GcContext = { remote: RemoteHistory; stores: HistoryStores };
export type GcOptions = { maxVersions?: number; retentionDays?: number };

const DAY_MS = 86_400_000;
const MAX_PACK_WINDOW = 32;
const DEFAULT_RETENTION_DAYS = 90;
const DEFAULT_MAX_VERSIONS = 100;

function packObjectKey(remote: RemoteHistory, pack: PackRef): string {
	return `${remote.ns}/packs/${pack.deviceId}/p-${String(pack.seq).padStart(8, '0')}-${pack.hash}.pack`;
}

/** Collects every chunk hash still referenced by commit entries newer than the retention cutoff. */
async function liveSet(
	ctx: GcContext,
	options: GcOptions,
): Promise<{ entries: Array<IndexEntry>; hashes: Set<string>; obsoletePacks: Set<string> }> {
	const retentionDays = options.retentionDays ?? DEFAULT_RETENTION_DAYS;
	const maxVersions = options.maxVersions ?? DEFAULT_MAX_VERSIONS;
	const cutoff = Date.now() - retentionDays * DAY_MS;
	const packEntries = new Map<string, Array<IndexEntry>>();
	for (const [, location] of await allCommitLocations(ctx.stores)) {
		const fileName = `p-${String(location.pack.seq).padStart(8, '0')}-${location.pack.hash}.pack`;
		if (!packEntries.has(fileName)) packEntries.set(fileName, []);
	}
	for (const [fileName, cached] of packEntries)
		if (cached.length === 0) {
			const bytes = await ctx.remote.getObject(
				`${ctx.remote.ns}/packs/${ctx.remote.deviceId}/${fileName}`,
			);
			const decoded = await decodePack(bytes);
			packEntries.set(fileName, decoded.entries);
		}

	const byKey = new Map<string, Array<{ entry: IndexEntry; fileName: string }>>();
	for (const [fileName, list] of packEntries)
		for (const entry of list) {
			const listForKey = byKey.get(entry.key) ?? [];
			listForKey.push({ entry, fileName });
			byKey.set(entry.key, listForKey);
		}

	const hashes = new Set<string>();
	const entries: Array<IndexEntry> = [];
	const livePacks = new Set<string>();
	const prunedEntries: Array<IndexEntry> = [];

	for (const [, fileEntries] of byKey) {
		fileEntries.sort((a, b) => b.entry.lamport - a.entry.lamport || b.entry.at - a.entry.at);
		let count = 0;
		for (const item of fileEntries)
			if (item.entry.at >= cutoff && count < maxVersions) {
				count++;
				entries.push(item.entry);
				livePacks.add(item.fileName);
				for (const chunk of item.entry.chunks) hashes.add(chunk.hash);
			} else prunedEntries.push(item.entry);
	}

	const obsoletePacks = new Set<string>();
	for (const fileName of packEntries.keys())
		if (!livePacks.has(fileName)) obsoletePacks.add(fileName);

	for (const entry of prunedEntries)
		await ctx.stores.index.delete(`${entry.key}@${entry.lamport}`);

	for (const [key, location] of await allCommitLocations(ctx.stores)) {
		const fileName = `p-${String(location.pack.seq).padStart(8, '0')}-${location.pack.hash}.pack`;
		if (obsoletePacks.has(fileName)) await ctx.stores.index.delete(key);
	}

	return { entries, hashes, obsoletePacks };
}

/**
 * Client-side compaction. Live chunks are rewritten into a new immutable pack (checkpoint entries),
 * then obsolete packs are deleted. A pack is never mutated in place. Re-running is idempotent.
 */
export async function compact(ctx: GcContext, options: number | GcOptions = {}): Promise<number> {
	const opts: GcOptions = typeof options === 'number' ? { retentionDays: options } : options;
	const { entries, hashes, obsoletePacks } = await liveSet(ctx, opts);
	if (entries.length === 0) return 0;

	const locations = new Map(
		(await allChunkLocations(ctx.stores)).map(([hash, loc]) => [hash, loc]),
	);
	const payloadParts: Array<Uint8Array> = [];
	const chunkLocations: Array<{ hash: string; location: ChunkLocation }> = [];
	const log = (await ctx.stores.heads.get(ctx.remote.deviceId)) ?? (await freshLog(ctx));
	const seq = log.seq + 1;
	const newRefBase: PackRef = {
		deviceId: ctx.remote.deviceId,
		fromLamport: Math.min(...entries.map((e) => e.lamport)),
		hash: '',
		seq,
		toLamport: Math.max(...entries.map((e) => e.lamport)),
	};
	let offset = 0;
	for (const hash of hashes) {
		const location = locations.get(hash);
		if (!location) continue;
		const bytes = await ctx.remote.getObject(packObjectKey(ctx.remote, location.pack));
		const decoded = await decodePack(bytes);
		const chunk = decoded.payload.subarray(location.offset, location.offset + location.length);
		payloadParts.push(new Uint8Array(chunk));
		chunkLocations.push({
			hash,
			location: { length: chunk.byteLength, offset, pack: newRefBase },
		});
		offset += chunk.byteLength;
	}
	const payload = concat(payloadParts);
	const checkpointEntries: Array<IndexEntry> = [];
	for (const entry of entries) {
		const chunks = [];
		for (const chunk of entry.chunks) chunks.push({ ...chunk });
		checkpointEntries.push({ ...entry, chunks, flags: entry.flags | FLAG_CHECKPOINT });
	}
	const encoded = await encodePack(
		{
			baseLamport: newRefBase.fromLamport,
			createdAt: Date.now(),
			deviceId: ctx.remote.deviceId,
			ns: ctx.remote.ns,
			peakLamport: newRefBase.toLamport,
			seq,
		},
		checkpointEntries,
		payload,
	);
	const realRef: PackRef = { ...newRefBase, hash: encoded.header.hash };
	for (const location of chunkLocations) location.location.pack = realRef;
	await ctx.remote.putPack(seq, encoded.header.hash, encoded.bytes);
	const nextLog = await buildCommitLog({
		chunkIndex: {},
		deviceId: ctx.remote.deviceId,
		generation: log.generation + 1,
		heads: log.heads,
		ns: ctx.remote.ns,
		packs: [realRef].slice(-MAX_PACK_WINDOW),
		peakLamport: realRef.toLamport,
		seq,
		updatedAt: Date.now(),
	});
	for (const location of chunkLocations) nextLog.chunkIndex[location.hash] = packRefKey(realRef);
	await ctx.remote.writeHead(nextLog);
	await ctx.stores.heads.set(ctx.remote.deviceId, nextLog);
	await markChunks(ctx.stores, chunkLocations);
	let removed = 0;
	for (const fileName of obsoletePacks) {
		await ctx.remote.deletePack(ctx.remote.deviceId, fileName);
		removed++;
	}
	return removed;
}

async function freshLog(ctx: GcContext): Promise<CommitLog> {
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

function concat(parts: Array<Uint8Array>): Uint8Array {
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
