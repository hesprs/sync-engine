import Onp from '@repo/shared/onp';
import type { IndexEntry } from '@/types';

/** Deterministic total order: all devices that saw the same commits linearize identically. */
export function compareCommits(a: IndexEntry, b: IndexEntry): number {
	return (
		a.lamport - b.lamport ||
		a.deviceId.localeCompare(b.deviceId) ||
		a.keyHash.localeCompare(b.keyHash)
	);
}

export function linearize(entries: ReadonlyArray<IndexEntry>): Array<IndexEntry> {
	return [...entries].sort(compareCommits);
}

/** Extracts the common (unchanged) token runs between two sequences via the shared ONP kernel. */
function commonRuns(o: ReadonlyArray<string>, side: ReadonlyArray<string>): Array<string> {
	const hunks = new Onp(o, side).compose();
	const common: Array<string> = [];
	let cursor = 0;
	for (const hunk of hunks) {
		const [start, length] = hunk.file1;
		for (const token of o.slice(cursor, start)) common.push(token);
		cursor = start + length;
	}
	for (const token of o.slice(cursor)) common.push(token);
	return common;
}

export type MergeResult = { tokens: Array<string>; conflicted: boolean };

/**
 * Two-stage merge. Stage 1 aligns the two chunk-hash sequences against the common ancestor with a
 * shared ONP LCS so unchanged chunk runs are reused by hash. Stage 2 hands only the divergent runs
 * to `mergeText`, producing merged tokens that a fresh CDC pass will store as new chunks.
 */
export function mergeChunkSequences(
	ancestor: ReadonlyArray<string>,
	a: ReadonlyArray<string>,
	b: ReadonlyArray<string>,
	mergeText: (o: string, a: string, b: string) => { text: string; conflicted: boolean },
): MergeResult {
	const commonA = commonRuns(ancestor, a);
	const commonB = commonRuns(ancestor, b);
	const commonSet = new Set(commonA.filter((token) => commonB.includes(token)));
	const changedA = a.filter((token) => !commonSet.has(token));
	const changedB = b.filter((token) => !commonSet.has(token));
	const merged = mergeText(ancestor.join('\n'), changedA.join('\n'), changedB.join('\n'));
	const divergent = merged.text.split('\n').filter((line) => line.length > 0);
	const tokens = [...commonA];
	for (const token of divergent) if (!tokens.includes(token)) tokens.push(token);
	return { conflicted: merged.conflicted, tokens };
}

/**
 * Line-level three-way merge built on the same ONP kernel (not a copy of Smart Merge's diff3).
 * Conflict markers are preserved so nothing is silently discarded.
 */
export function mergeTextLines(
	o: string,
	a: string,
	b: string,
): { text: string; conflicted: boolean } {
	const base = o.split('\n');
	const left = a.split('\n');
	const right = b.split('\n');
	if (left.join('\n') === right.join('\n')) return { conflicted: false, text: a };
	if (left.join('\n') === base.join('\n')) return { conflicted: false, text: b };
	if (right.join('\n') === base.join('\n')) return { conflicted: false, text: a };
	const common = commonRuns(base, left);
	const commonRight = new Set(commonRuns(base, right));
	const stable = common.filter((line) => commonRight.has(line));
	const localOnly = left.filter((line) => !stable.includes(line));
	const remoteOnly = right.filter((line) => !stable.includes(line));
	const parts = [...stable];
	if (localOnly.length && remoteOnly.length) {
		parts.push('<<<<<<< ours', ...localOnly, '=======', ...remoteOnly, '>>>>>>> theirs');
		return { conflicted: true, text: parts.join('\n') };
	}
	parts.push(...localOnly, ...remoteOnly);
	return { conflicted: false, text: parts.join('\n') };
}

/** A merge commit has both tips as parents; the result is committed even when conflicted. */
export function mergeCommit(options: {
	a: IndexEntry;
	b: IndexEntry;
	deviceId: string;
	key: string;
	lamport: number;
}): Pick<IndexEntry, 'key' | 'keyHash' | 'lamport' | 'deviceId' | 'at' | 'parents'> {
	const { a, b, deviceId, key, lamport } = options;
	return {
		at: Date.now(),
		deviceId,
		key,
		keyHash: a.keyHash,
		lamport,
		parents: [`${a.key}@${a.lamport}`, `${b.key}@${b.lamport}`],
	};
}
