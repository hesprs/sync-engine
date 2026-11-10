import { computeLineDiff } from '@/modal';
import { expect, test } from 'bun:test';

test('computeLineDiff produces unchanged lines for identical texts', () => {
	const lines = computeLineDiff('hello\nworld', 'hello\nworld');
	expect(lines).toStrictEqual([
		{ text: 'hello', type: 'unchanged' },
		{ text: 'world', type: 'unchanged' },
	]);
});

test('computeLineDiff identifies additions and removals', () => {
	const historical = 'line 1\nline 2\nline 3';
	const current = 'line 1\nmodified line 2\nline 3\nline 4';
	const lines = computeLineDiff(historical, current);
	expect(lines).toStrictEqual([
		{ text: 'line 1', type: 'unchanged' },
		{ text: 'line 2', type: 'removed' },
		{ text: 'modified line 2', type: 'added' },
		{ text: 'line 3', type: 'unchanged' },
		{ text: 'line 4', type: 'added' },
	]);
});
