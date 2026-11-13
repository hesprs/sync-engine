import { buildCommitLog } from '@/head-log';
import { allChunkLocations, allCommitLocations, markChunks, packRefKey } from '@/index-store';
import { decodePack, encodePack, packFileName } from '@/pack';
import { FLAG_CHECKPOINT } from '@/types';
import { isNotFound } from '@repo/shared/error';
import type { DecodedPack } from '@/pack';
import type { RemoteHistory } from '@/remote';
import type { HistoryStores } from '@/store';
import type { ChunkLocation, CommitLog, IndexEntry, PackRef } from '@/types';

export type GcContext = { remote: RemoteHistory; stores: HistoryStores };
export type GcOptions = { maxVersions?: number; retentionDays?: number };

const DAY_MS = 86_400_000;
const MAX_PACK_WINDOW = 32;
const DEFAULT_RETENTION_DAYS = 90;
const DEFAULT_MAX_VERSIONS = 100;

function isMissingError(error: unknown): boolean {
	if (isNotFound(error)) return true;
	const msg = String(error).toLowerCase();
	return msg.includes('nosuchkey') || msg.includes('missing') || msg.includes('not found');
}

function packObjectKey(remote: RemoteHistory, pack: PackRef): string {
	return `${remote.ns}/packs/${pack.deviceId}/p-${String(pack.seq).padStart(8, '0')}-${pack.hash}.pack`;
}

/** Collects every chunk hash still referenced by commit entries newer than the retention cutoff. */
async function liveSet(
	ctx: GcContext,
	options: GcOptions,
): Promise<{
	decodedPacks: Map<string, DecodedPack>;
	entries: Array<IndexEntry>;
	hashes: Set<string>;
	obsoletePacks: Map<string, PackRef>;
}> {
	const retentionDays = options.retentionDays ?? DEFAULT_RETENTION_DAYS;
	const maxVersions = options.maxVersions ?? DEFAULT_MAX_VERSIONS;
	const cutoff = Date.now() - retentionDays * DAY_MS;

	const packMap = new Map<string, { pack: PackRef; versionKeys: Array<string> }>();
	for (const [key, location] of await allCommitLocations(ctx.stores)) {
		const pKey = packRefKey(location.pack);
		let item = packMap.get(pKey);
		if (!item) {
			item = { pack: location.pack, versionKeys: [] };
			packMap.set(pKey, item);
		}
		item.versionKeys.push(key);
	}

	const decodedPacks = new Map<string, DecodedPack>();
	for (const [pKey, item] of packMap)
		try {
			const bytes = await ctx.remote.getObject(packObjectKey(ctx.remote, item.pack));
			const decoded = await decodePack(bytes);
			decodedPacks.set(pKey, decoded);
		} catch (error) {
			if (isMissingError(error)) {
				for (const deadKey of item.versionKeys) await ctx.stores.index.delete(deadKey);
				continue;
			}
			throw error;
		}

	const byKey = new Map<string, Array<{ entry: IndexEntry; packKey: string }>>();
	for (const [pKey, decoded] of decodedPacks)
		for (const entry of decoded.entries) {
			const list = byKey.get(entry.key) ?? [];
			list.push({ entry, packKey: pKey });
			byKey.set(entry.key, list);
		}

	const hashes = new Set<string>();
	const entries: Array<IndexEntry> = [];
	const livePackKeys = new Set<string>();
	const prunedEntries: Array<IndexEntry> = [];

	for (const [, fileEntries] of byKey) {
		fileEntries.sort((a, b) => b.entry.lamport - a.entry.lamport || b.entry.at - a.entry.at);
		let count = 0;
		for (const item of fileEntries)
			if (item.entry.at >= cutoff && count < maxVersions) {
				count++;
				entries.push(item.entry);
				livePackKeys.add(item.packKey);
				for (const chunk of item.entry.chunks) hashes.add(chunk.hash);
			} else prunedEntries.push(item.entry);
	}

	const obsoletePacks = new Map<string, PackRef>();
	for (const [pKey, item] of packMap)
		if (!livePackKeys.has(pKey)) obsoletePacks.set(pKey, item.pack);

	for (const entry of prunedEntries)
		await ctx.stores.index.delete(`${entry.key}@${entry.lamport}`);

	for (const [key, location] of await allCommitLocations(ctx.stores))
		if (obsoletePacks.has(packRefKey(location.pack))) await ctx.stores.index.delete(key);

	return { decodedPacks, entries, hashes, obsoletePacks };
}

/**
 * Client-side compaction. Live chunks are rewritten into a new immutable pack (checkpoint entries),
 * then obsolete packs are deleted. A pack is never mutated in place. Re-running is idempotent.
 */
export async function compact(ctx: GcContext, options: number | GcOptions = {}): Promise<number> {
	const opts: GcOptions = typeof options === 'number' ? { retentionDays: options } : options;
	const { decodedPacks, entries, hashes, obsoletePacks } = await liveSet(ctx, opts);
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
		const pKey = packRefKey(location.pack);
		let decoded = decodedPacks.get(pKey);
		if (!decoded)
			try {
				const bytes = await ctx.remote.getObject(packObjectKey(ctx.remote, location.pack));
				decoded = await decodePack(bytes);
				decodedPacks.set(pKey, decoded);
			} catch (error) {
				if (isMissingError(error)) continue;
				throw error;
			}
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
	for (const pack of obsoletePacks.values())
		try {
			await ctx.remote.deletePack(
				pack.deviceId,
				packFileName(pack.deviceId, pack.seq, pack.hash),
			);
			removed++;
		} catch (error) {
			if (isMissingError(error)) continue;
			throw error;
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
