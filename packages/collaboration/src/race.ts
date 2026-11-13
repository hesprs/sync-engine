import type {
	ConflictResolver,
	DeciderInput,
	RecordStatsMap,
	StatsMap,
} from '@hesprs/sync-engine-sdk';

export const RACE_WINDOW = 30_000;
const MAX_JOURNAL_ENTRIES = 4096;

export type UploadEpoch = { key: string; localUid: string; remoteUid: string; uploadedAt: number };

export class RaceJournal {
	private readonly entries = new Map<string, UploadEpoch>();

	record(epoch: UploadEpoch): void {
		this.delete(epoch.key);
		this.entries.set(epoch.key, epoch);
		while (this.entries.size > MAX_JOURNAL_ENTRIES) {
			const oldest = this.entries.keys().next().value;
			if (oldest === undefined) break;
			this.delete(oldest);
		}
	}

	get(key: string): UploadEpoch | undefined {
		return this.entries.get(key);
	}

	all(): IterableIterator<[string, UploadEpoch]> {
		return this.entries.entries();
	}

	prune(now = Date.now()): void {
		for (const [key, epoch] of this.entries)
			if (now - epoch.uploadedAt > RACE_WINDOW) this.delete(key);
	}

	delete(key: string): void {
		this.entries.delete(key);
	}

	clear(): void {
		this.entries.clear();
	}
}

/**
 * Finds uploads that a peer overwrote, using the REAL remote listing (DeciderInput.remoteStats)
 * rather than a peer-supplied stat list. Only journal keys are examined, so cost is proportional to
 * recent uploads, not to the size of the vault. The time window itself is enforced by
 * forceRaceConflicts with Date.now().
 */
export function findRaceCandidates({
	journal,
	remoteStats,
	window = RACE_WINDOW,
}: {
	journal: RaceJournal;
	remoteStats: StatsMap;
	window?: number;
}): Map<string, UploadEpoch> {
	const candidates = new Map<string, UploadEpoch>();
	for (const [key, epoch] of journal.all()) {
		const remote = remoteStats.get(key);
		if (!remote || remote.isDir) continue;
		if (remote.uid === epoch.remoteUid) continue;
		if (remote.mtime > 0 && Math.abs(remote.mtime - epoch.uploadedAt) > window) continue;
		candidates.set(key, epoch);
	}
	return candidates;
}

export function forceRaceConflicts(
	input: DeciderInput,
	candidates: ReadonlyMap<string, UploadEpoch>,
	now = Date.now(),
): { forcedKeys: Set<string>; records: RecordStatsMap } {
	const records = new Map(input.records);
	const forcedKeys = new Set<string>();
	for (const [key, epoch] of candidates) {
		if (now - epoch.uploadedAt > RACE_WINDOW) continue;
		const record = input.records.get(key);
		const local = input.localStats.get(key);
		const remote = input.remoteStats.get(key);
		if (
			!record ||
			record.isDir ||
			!local ||
			local.isDir ||
			!remote ||
			remote.isDir ||
			record.local !== epoch.localUid ||
			record.remote !== epoch.remoteUid ||
			local.uid !== epoch.localUid ||
			remote.uid === epoch.remoteUid
		)
			continue;
		records.set(key, {
			isDir: false,
			local: `\0collaboration-race:${key}:${epoch.uploadedAt}`,
			remote: record.remote,
		});
		forcedKeys.add(key);
	}
	return { forcedKeys, records };
}

/**
 * A forced conflict means this device's recent upload was overwritten by a peer. The edit is
 * durably captured by the history module, so there is nothing to replay here: the forced record
 * routes the key into the configured conflict resolver, which merges the divergent versions.
 */
export function createRaceAwareResolver({
	getConfiguredResolver,
}: {
	getConfiguredResolver: () => ConflictResolver;
}): ConflictResolver {
	return async (payload) => getConfiguredResolver()(payload);
}
