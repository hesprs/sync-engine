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

test('83-line file with 1 line added produces exactly 1 line diff', () => {
	const historical = Array.from({ length: 83 }, (_, i) => `Line ${i + 1}`).join('\n');
	const current = `${historical}\nLine 84`;
	const lines = computeLineDiff(historical, current);
	let added = 0;
	let removed = 0;
	let unchanged = 0;
	for (const l of lines)
		if (l.type === 'added') added++;
		else if (l.type === 'removed') removed++;
		else unchanged++;

	expect(added).toBe(1);
	expect(removed).toBe(0);
	expect(unchanged).toBe(83);
});

test('computeLineDiff handles empty strings cleanly without phantom line changes', () => {
	expect(computeLineDiff('', 'hello')).toStrictEqual([{ text: 'hello', type: 'added' }]);
	expect(computeLineDiff('hello', '')).toStrictEqual([{ text: 'hello', type: 'removed' }]);
	expect(computeLineDiff('', '')).toStrictEqual([]);
});

test('computeLineDiff normalizes CRLF and LF line endings', () => {
	const historical = 'line 1\r\nline 2\r\n';
	const current = 'line 1\nline 2\nline 3\n';
	const lines = computeLineDiff(historical, current);
	const added = lines.filter((l) => l.type === 'added');
	const removed = lines.filter((l) => l.type === 'removed');
	expect(added).toHaveLength(1);
	expect(removed).toHaveLength(0);
});
