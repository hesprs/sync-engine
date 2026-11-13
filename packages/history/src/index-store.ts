import type { HistoryStores } from '@/store';
import type { ChunkLocation, CommitLocation, PackRef, VersionRef } from '@/types';

export function versionKey(ref: VersionRef): string {
	return ref.commitHash ?? `${ref.key}@${ref.lamport ?? ''}`;
}

/** Records where a commit lives so restore is an O(1) local lookup. */
export async function putCommitLocation(
	stores: HistoryStores,
	ref: string,
	location: CommitLocation,
): Promise<void> {
	await stores.index.set(ref, location);
}

export async function lookupCommit(
	stores: HistoryStores,
	ref: VersionRef,
): Promise<CommitLocation | undefined> {
	return stores.index.get(versionKey(ref));
}

/** Confirms that a chunk is present remotely, enabling cross-version/cross-note dedup. */
export async function markChunks(
	stores: HistoryStores,
	chunks: Array<{ hash: string; location: ChunkLocation }>,
): Promise<void> {
	await stores.chunks.batch(
		chunks.map(({ hash, location }) => ({ key: hash, type: 'set' as const, value: location })),
	);
}

export async function chunkLocation(
	stores: HistoryStores,
	hash: string,
): Promise<ChunkLocation | undefined> {
	return stores.chunks.get(hash);
}

/** Reads every known commit location (used by GC and the version picker). */
export async function allCommitLocations(
	stores: HistoryStores,
): Promise<Array<[string, CommitLocation]>> {
	return stores.index.entries();
}

export async function allChunkLocations(
	stores: HistoryStores,
): Promise<Array<[string, ChunkLocation]>> {
	return stores.chunks.entries();
}

export function packRefKey(pack: PackRef): string {
	return `${pack.deviceId}:${pack.seq}:${pack.hash}`;
}
