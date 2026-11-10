import { compareCommits, linearize, mergeChunkSequences, mergeCommit, mergeTextLines } from '@/dag';
import { expect, test } from 'bun:test';
import type { IndexEntry } from '@/types';

function entry(overrides: Partial<IndexEntry> = {}): IndexEntry {
	return {
		at: 1000,
		blobs: [],
		chunks: [],
		deviceId: 'a',
		flags: 0,
		key: 'note.md',
		keyHash: 'kh',
		lamport: 1,
		parents: [],
		...overrides,
	};
}

test('compareCommits gives a deterministic total order', () => {
	const a = entry({ deviceId: 'a', keyHash: 'k', lamport: 1 });
	const b = entry({ deviceId: 'b', keyHash: 'k', lamport: 1 });
	const c = entry({ deviceId: 'a', keyHash: 'k', lamport: 2 });
	expect(compareCommits(a, b)).toBeLessThan(0);
	expect(compareCommits(a, c)).toBeLessThan(0);
	expect(linearize([c, b, a]).map((e) => e.lamport)).toStrictEqual([1, 1, 2]);
});

test('mergeTextLines takes a clean side when the other is unchanged', () => {
	const o = 'a\nb\nc';
	expect(mergeTextLines(o, 'a\nB\nc', o)).toStrictEqual({ conflicted: false, text: 'a\nB\nc' });
	expect(mergeTextLines(o, o, 'a\nb\nC')).toStrictEqual({ conflicted: false, text: 'a\nb\nC' });
});

test('mergeTextLines emits conflict markers when both sides diverge', () => {
	const result = mergeTextLines('a\nb\nc', 'a\nL\nc', 'a\nR\nc');
	expect(result.conflicted).toBe(true);
	expect(result.text).toContain('<<<<<<< ours');
	expect(result.text).toContain('>>>>>>> theirs');
});

test('mergeChunkSequences reuses common chunk hashes', () => {
	const o = ['c1', 'c2', 'c3'];
	const a = ['c1', 'cX', 'c3'];
	const b = ['c1', 'c2', 'c3'];
	const result = mergeChunkSequences(o, a, b, mergeTextLines);
	expect(result.tokens).toContain('c1');
	expect(result.tokens).toContain('c3');
});

test('mergeCommit names both tips as parents', () => {
	const a = entry({ deviceId: 'a', lamport: 2 });
	const b = entry({ deviceId: 'b', lamport: 3 });
	const merged = mergeCommit({ a, b, deviceId: 'a', key: 'note.md', lamport: 4 });
	expect(merged.parents).toStrictEqual(['note.md@2', 'note.md@3']);
});
