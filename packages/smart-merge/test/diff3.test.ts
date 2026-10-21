import { diffMerge } from '@/diff3';
import { expect, test } from 'bun:test';

test('diffMerge returns ok and conflict chunks with source spans', () => {
	const result = diffMerge(
		['1', 'L', '3', '4', '5'],
		['1', 'B', '3', '4', '5'],
		['1', 'R', '3', '4', '6'],
	);

	expect(result).toStrictEqual([
		{ a: ['1'], b: ['1'], merged: ['1'], o: ['1'], type: 'ok' },
		{ a: ['L'], b: ['R'], o: ['B'], type: 'conflict' },
		{ a: ['3', '4'], b: ['3', '4'], merged: ['3', '4'], o: ['3', '4'], type: 'ok' },
		{ a: ['5'], b: ['6'], merged: ['6'], o: ['5'], type: 'ok' },
	]);
});

test('diffMerge chunks can flatten back to original arrays', () => {
	const a = ['1', 'L', '3', '4', '5'];
	const o = ['1', 'B', '3', '4', '5'];
	const b = ['1', 'R', '3', '4', '6'];
	const result = diffMerge(a, o, b);

	expect(result.flatMap((chunk) => chunk.a)).toStrictEqual(a);
	expect(result.flatMap((chunk) => chunk.o)).toStrictEqual(o);
	expect(result.flatMap((chunk) => chunk.b)).toStrictEqual(b);
});

test('diffMerge deduplicates identical empty-base insertions', () => {
	const result = diffMerge(['same content'], [], ['same content']);

	expect(result).toStrictEqual([
		{ a: ['same content'], b: ['same content'], merged: ['same content'], o: [], type: 'ok' },
	]);
});

test('diffMerge two-way merges same-place insertion with empty base', () => {
	const result = diffMerge(['local', 'only', 'content'], [], ['remote', 'only', 'content']);

	expect(result).toStrictEqual([
		{ a: ['local'], b: ['remote'], o: [], type: 'conflict' },
		{
			a: ['only', 'content'],
			b: ['only', 'content'],
			merged: ['only', 'content'],
			o: [],
			type: 'ok',
		},
	]);
});

test('diffMerge keeps anchored same-place edits as conflict', () => {
	const result = diffMerge(
		['common_prefix', 'shared_line_local_version', 'common_suffix'],
		['common_prefix', 'shared_line_base'],
		['common_prefix', 'shared_line_remote_version', 'common_suffix'],
	);

	expect(result).toStrictEqual([
		{
			a: ['common_prefix'],
			b: ['common_prefix'],
			merged: ['common_prefix'],
			o: ['common_prefix'],
			type: 'ok',
		},
		{
			a: ['shared_line_local_version'],
			b: ['shared_line_remote_version'],
			o: ['shared_line_base'],
			type: 'conflict',
		},
		{
			a: ['common_suffix'],
			b: ['common_suffix'],
			merged: ['common_suffix'],
			o: [],
			type: 'ok',
		},
	]);
});

test('diffMerge keeps same-place different edits distinct', () => {
	const result = diffMerge(
		['common_prefix', 'local_suffix'],
		['common_prefix'],
		['common_prefix', 'remote_suffix'],
	);

	expect(result).toStrictEqual([
		{
			a: ['common_prefix'],
			b: ['common_prefix'],
			merged: ['common_prefix'],
			o: ['common_prefix'],
			type: 'ok',
		},
		{ a: ['local_suffix'], b: [], merged: ['local_suffix'], o: [], type: 'ok' },
		{ a: [], b: ['remote_suffix'], merged: ['remote_suffix'], o: [], type: 'ok' },
	]);
});

test('diffMerge preserves source spans after same-offset insertion and deletion', () => {
	const a = [
		'intro',
		'local 1',
		'local 2',
		'deleted 1',
		'deleted 2',
		'after heading',
		'after paragraph',
	];
	const o = ['intro', 'deleted 1', 'deleted 2', 'after heading', 'after paragraph'];
	const b = ['intro', 'after heading', 'after paragraph edited'];
	const result = diffMerge(a, o, b);

	expect(result.flatMap((chunk) => chunk.a)).toStrictEqual(a);
	expect(result.flatMap((chunk) => chunk.o)).toStrictEqual(o);
	expect(result.flatMap((chunk) => chunk.b)).toStrictEqual(b);
});
