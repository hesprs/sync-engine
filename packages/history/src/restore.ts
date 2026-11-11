import { assembleChunks, captureContent } from '@/chunker';
import { mergeTextLines } from '@/dag';
import { reconcile } from '@/flush';
import { chunkLocation, lookupCommit, versionKey } from '@/index-store';
import { decodePack, readIndexOnly } from '@/pack';
import { appendWal, blobPresent } from '@/store';
import { FLAG_DELETION, FLAG_SMALL_FILE } from '@/types';
import { sha256Bytes } from '@repo/shared/sha256-bytes';
import type { RemoteHistory } from '@/remote';
import type { HistoryStores } from '@/store';
import type { ChunkRef, IndexEntry, RestoreResult, VersionRef, VersionSummary } from '@/types';

export type RestoreContext = { remote: RemoteHistory; stores: HistoryStores };

function packObjectKey(remote: RemoteHistory, fileName: string, deviceId: string): string {
	return `${remote.ns}/packs/${deviceId}/${fileName}`;
}

function packFileNameFromRef(deviceId: string, seq: number, hash: string): string {
	return `p-${String(seq).padStart(8, '0')}-${hash}.pack`;
}

async function fetchPack(
	ctx: RestoreContext,
	pack: { deviceId: string; seq: number; hash: string },
): Promise<Uint8Array> {
	return ctx.remote.getObject(
		packObjectKey(
			ctx.remote,
			packFileNameFromRef(pack.deviceId, pack.seq, pack.hash),
			pack.deviceId,
		),
	);
}

/** Resolves an ordered ChunkRef[] into bytes, fetching only packs that hold missing chunks. */
async function resolveChunks(
	ctx: RestoreContext,
	chunks: Array<ChunkRef>,
	ownPayload?: Uint8Array,
): Promise<Array<Uint8Array>> {
	const out: Array<Uint8Array> = [];
	for (const chunk of chunks) {
		if (chunk.offset >= 0 && ownPayload) {
			out.push(ownPayload.subarray(chunk.offset, chunk.offset + chunk.length));
			continue;
		}
		const location = await chunkLocation(ctx.stores, chunk.hash);
		if (!location) throw new Error(`Missing chunk ${chunk.hash}`);
		const bytes = await fetchPack(ctx, location.pack);
		const decoded = await decodePack(bytes);
		out.push(decoded.payload.subarray(location.offset, location.offset + location.length));
	}
	return out;
}

/** O(1) local lookup; on a miss, refresh heads and rebuild the indexes before giving up. */
async function lookupWithRepair(ctx: RestoreContext, ref: VersionRef) {
	const hit = await lookupCommit(ctx.stores, ref);
	if (hit) return hit;
	// Head refresh → bounded per-device pack repair → full index rebuild, then retry.
	await reconcile({ remote: ctx.remote, requestSync: () => {}, stores: ctx.stores });
	const repaired = await lookupCommit(ctx.stores, ref);
	if (!repaired) throw new Error(`No commit location for ${ref.key}`);
	return repaired;
}

/** Restores one version with a bounded number of remote reads. */
export async function restoreVersion(ctx: RestoreContext, ref: VersionRef): Promise<RestoreResult> {
	const location = await lookupWithRepair(ctx, ref);
	let bytes: Uint8Array;
	try {
		bytes = await fetchPack(ctx, location.pack);
	} catch (error) {
		await ctx.stores.index.delete(versionKey(ref));
		throw error;
	}
	const { entries } = await readIndexOnly(bytes);
	const entry = entries.find(
		(candidate) => candidate.key === ref.key && candidate.lamport === ref.lamport,
	);
	// Never fall back to another commit in the pack: a pack batches edits from many files, so
	// returning entries[0] would silently restore a different file's content.
	if (!entry) {
		await ctx.stores.index.delete(versionKey(ref));
		throw new Error(`Version ${ref.key}@${ref.lamport} is missing from its pack`);
	}

	const decoded = await decodePack(bytes);
	let text: string;
	if (entry.flags & FLAG_SMALL_FILE && entry.inlineOffset !== undefined)
		text = new TextDecoder().decode(
			decoded.payload.subarray(
				entry.inlineOffset,
				entry.inlineOffset + (entry.inlineLength ?? 0),
			),
		);
	else {
		const parts = await resolveChunks(ctx, entry.chunks, decoded.payload);
		text = assembleChunks(parts);
	}

	let merged = false;
	if (entry.parents.length > 1) {
		// A DAG fork: align the two tips against their common ancestor and merge divergent runs.
		const tips = await Promise.all(
			entry.parents.slice(0, 2).map(async (parent) => findEntry(ctx, parent)),
		);
		const ancestor = await findAncestor(ctx, tips[0], tips[1]);
		if (tips[0] && tips[1]) {
			const [text0, text1, textAncestor] = await Promise.all([
				readEntryText(ctx, tips[0]),
				readEntryText(ctx, tips[1]),
				readEntryText(ctx, ancestor),
			]);
			const mergeResult = mergeTextLines(textAncestor, text0, text1);
			text = mergeResult.text;
			merged = true;
			// Conflict markers are still committed; nothing is silently discarded. The merged text
			// becomes a new commit with both tips as parents, then a fresh CDC pass persists only
			// its new chunks (queued in the WAL for the next flush).
			const content = await captureContent(
				ctx.stores,
				entry.key,
				new TextEncoder().encode(text),
			);
			await appendWal(ctx.stores, {
				at: Date.now(),
				key: entry.key,
				parent: '',
				parents: entry.parents.slice(0, 2),
				...content,
			});
		}
	}

	for (const blob of entry.blobs)
		if (!(await blobPresent(ctx.stores, blob.hash)))
			await ctx.remote.getObject(`${ctx.remote.ns}/blobs/${blob.hash}.blob`);
	return { at: entry.at, key: entry.key, lamport: entry.lamport, merged, text };
}

async function findEntry(ctx: RestoreContext, refKey: string): Promise<IndexEntry | undefined> {
	const [key, lamport] = refKey.split('@');
	const location = await lookupCommit(ctx.stores, { key, lamport: Number(lamport) });
	if (!location) return undefined;
	const bytes = await fetchPack(ctx, location.pack);
	const { entries } = await readIndexOnly(bytes);
	return entries.find((entry) => entry.key === key && entry.lamport === Number(lamport));
}

async function findAncestor(
	ctx: RestoreContext,
	a?: IndexEntry,
	b?: IndexEntry,
): Promise<IndexEntry | undefined> {
	if (!a || !b) return undefined;
	for (const parent of a.parents) {
		const entry = await findEntry(ctx, parent);
		if (entry && b.parents.includes(`${entry.key}@${entry.lamport}`)) return entry;
	}
	return undefined;
}

async function readEntryText(ctx: RestoreContext, entry?: IndexEntry): Promise<string> {
	if (!entry) return '';
	const location = await lookupCommit(ctx.stores, { key: entry.key, lamport: entry.lamport });
	if (!location) return '';
	const bytes = await fetchPack(ctx, location.pack);
	const decoded = await decodePack(bytes);
	if (entry.flags & FLAG_SMALL_FILE && entry.inlineOffset !== undefined)
		return new TextDecoder().decode(
			decoded.payload.subarray(
				entry.inlineOffset,
				entry.inlineOffset + (entry.inlineLength ?? 0),
			),
		);
	const parts = await resolveChunks(ctx, entry.chunks, decoded.payload);
	return assembleChunks(parts);
}

async function resolveFingerprint(
	entry: IndexEntry,
	getPayload: () => Promise<Uint8Array>,
): Promise<string | undefined> {
	if (entry.hash) return entry.hash;
	if (entry.flags & FLAG_DELETION) return '<deleted>';
	if (entry.chunks.length > 0) return entry.chunks.map((c) => c.hash).join(',');
	if (entry.blobs.length > 0) return entry.blobs.map((b) => b.hash).join(',');
	if (
		entry.flags & FLAG_SMALL_FILE &&
		entry.inlineOffset !== undefined &&
		entry.inlineLength !== undefined
	) {
		const payload = await getPayload();
		const slice = payload.subarray(entry.inlineOffset, entry.inlineOffset + entry.inlineLength);
		return sha256Bytes(slice);
	}
	return undefined;
}

/** Lists a file's versions with their timestamps, reading each pack's index at most once. */
export async function listVersions(
	ctx: RestoreContext,
	key: string,
): Promise<Array<VersionSummary>> {
	const prefix = `${key}@`;
	const refs = (await ctx.stores.index.entries()).filter(([ref]) => ref.startsWith(prefix));
	const byPack = new Map<
		string,
		{ deviceId: string; hash: string; seq: number; lamports: Array<number> }
	>();
	for (const [ref, location] of refs) {
		const { deviceId, hash, seq } = location.pack;
		const packKey = `${deviceId}:${seq}:${hash}`;
		let group = byPack.get(packKey);
		if (!group) {
			group = { deviceId, hash, lamports: [], seq };
			byPack.set(packKey, group);
		}
		group.lamports.push(Number(ref.slice(prefix.length)));
	}
	type VersionWithFingerprint = VersionSummary & { fingerprint?: string };
	const summaries: Array<VersionWithFingerprint> = [];
	for (const group of byPack.values()) {
		let bytes: Uint8Array;
		try {
			bytes = await fetchPack(ctx, group);
		} catch {
			for (const lamport of group.lamports)
				await ctx.stores.index.delete(`${key}@${lamport}`);
			continue;
		}
		const { entries } = await readIndexOnly(bytes);
		let decodedPayload: Uint8Array | undefined;
		const getPayload = async () => {
			if (!decodedPayload) {
				const decoded = await decodePack(bytes);
				decodedPayload = decoded.payload;
			}
			return decodedPayload;
		};
		for (const lamport of group.lamports) {
			const entry = entries.find(
				(candidate) => candidate.lamport === lamport && candidate.key === key,
			);
			if (!entry) {
				await ctx.stores.index.delete(`${key}@${lamport}`);
				continue;
			}
			const fp = await resolveFingerprint(entry, getPayload);
			summaries.push({ at: entry.at, fingerprint: fp, index: 0, key, lamport });
		}
	}
	// Versions are per file: number them 1..N newest-first so the UI never exposes the global
	// Lamport clock (which is shared across every file and therefore has gaps).
	summaries.sort((a, b) => b.lamport - a.lamport);
	const distinct: Array<VersionWithFingerprint> = [];
	let lastFp: string | undefined;
	for (const summary of summaries) {
		if (summary.fingerprint !== undefined && summary.fingerprint === lastFp) continue;
		lastFp = summary.fingerprint;
		distinct.push(summary);
	}
	const numbered: Array<VersionSummary> = [];
	for (const [position, summary] of distinct.entries())
		numbered.push({
			at: summary.at,
			index: position + 1,
			key: summary.key,
			lamport: summary.lamport,
		});
	return numbered;
}
