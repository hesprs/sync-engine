import Onp from '@/onp';
import { expect, test } from 'bun:test';
import type { DiffHunk } from '@/onp';

function spansCover(hunks: Array<DiffHunk>, a: ReadonlyArray<string>, b: ReadonlyArray<string>) {
	let x = 0;
	let y = 0;
	for (const hunk of hunks) {
		expect(hunk.file1[0]).toBeGreaterThanOrEqual(x);
		expect(hunk.file2[0]).toBeGreaterThanOrEqual(y);
		x = hunk.file1[0] + hunk.file1[1];
		y = hunk.file2[0] + hunk.file2[1];
		expect(x).toBeLessThanOrEqual(a.length);
		expect(y).toBeLessThanOrEqual(b.length);
	}
}

test('identical sequences produce no change hunks', () => {
	const a = ['a', 'b', 'c', 'd'];
	const hunks = new Onp(a, ['a', 'b', 'c', 'd']).compose();
	expect(hunks).toStrictEqual([]);
});

test('a single insertion yields one localized change hunk', () => {
	const a = ['a', 'b', 'c'];
	const b = ['a', 'b', 'X', 'c'];
	const hunks = new Onp(a, b).compose();
	expect(hunks).toHaveLength(1);
	spansCover(hunks, a, b);
	expect(hunks[0].file1[1]).toBe(0);
	expect(hunks[0].file2[1]).toBe(1);
});

test('a single deletion yields one localized change hunk', () => {
	const a = ['a', 'b', 'X', 'c'];
	const b = ['a', 'b', 'c'];
	const hunks = new Onp(a, b).compose();
	expect(hunks).toHaveLength(1);
	spansCover(hunks, a, b);
	expect(hunks[0].file1[1]).toBe(1);
	expect(hunks[0].file2[1]).toBe(0);
});

test('a replacement keeps surrounding runs as common', () => {
	const a = ['1', 'L', '3', '4', '5'];
	const b = ['1', 'R', '3', '4', '6'];
	const hunks = new Onp(a, b).compose();
	spansCover(hunks, a, b);
	// The divergent middle and the divergent tail are the only changed regions.
	expect(hunks.length).toBeGreaterThanOrEqual(2);
});

test('reversed input (m < n) swaps sequences and still produces valid hunks', () => {
	const a = ['a', 'b'];
	const b = ['a', 'b', 'c', 'd', 'e'];
	const hunks = new Onp(a, b).compose();
	spansCover(hunks, a, b);
	expect(hunks.some((h) => h.file2[1] > 0 && h.file1[1] === 0)).toBe(true);
});

test('empty sequences are handled without error', () => {
	expect(new Onp([], []).compose()).toStrictEqual([]);
	expect(new Onp([], ['x']).compose()).toHaveLength(1);
	expect(new Onp(['x'], []).compose()).toHaveLength(1);
});
