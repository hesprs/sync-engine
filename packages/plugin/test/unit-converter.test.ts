import { expect, test } from 'bun:test';
import { parseTime, formatTime } from '@/utils/unit-converter';

test('parses values with and without explicit units', () => {
	expect(parseTime('2500ms')).toBe(2500);
	expect(parseTime('2.5 s')).toBe(2500);
	expect(parseTime('3')).toBe(3000);
});

test('rejects invalid or negative input', () => {
	expect(parseTime('-1s')).toBeUndefined();
	expect(parseTime('abc')).toBeUndefined();
	expect(parseTime('1fortnight')).toBeUndefined();
});

test('formats using the largest matching unit', () => {
	expect(formatTime(2500)).toBe('2.5 s');
	expect(formatTime(120_000)).toBe('2 min');
});

test('falls back to the smallest unit for sub-unit values', () => {
	expect(formatTime(0.4)).toBe('0.4 ms');
});
