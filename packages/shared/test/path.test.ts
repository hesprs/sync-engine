import { expect, test } from 'bun:test';
import {
	normalizeBaseDir,
	normalizeKey,
	parseUrl,
	formatUrl,
	stripEndSlash,
	basename,
	dirname,
} from '@/path';

test('normalizes keys with dir suffix', () => {
	expect(normalizeKey('/base//folder/note.md', false)).toBe('base/folder/note.md');
	expect(normalizeKey('/base//folder/', true)).toBe('base/folder/');
});

test('normalizes base dir', () => {
	expect(normalizeBaseDir('/base/aabbcc//')).toBe('base/aabbcc/');
	expect(normalizeBaseDir('/')).toBe('/');
});

test('returns dirname for keys', () => {
	expect(dirname('/')).toBe('/');
	expect(dirname('folder/note.md')).toBe('folder/');
	expect(dirname('folder/')).toBe('/');
});

test('returns basename for keys', () => {
	expect(basename('/')).toBe('');
	expect(basename('folder/note.md')).toBe('note.md');
	expect(basename('folder/')).toBe('folder');
});

test('parses urls', () => {
	expect(parseUrl('https://example.com/a b?x=a b')).toBe('https://example.com/a%20b?x=a%20b');
	expect(parseUrl('https://example.com/€')).toBe('https://example.com/%E2%82%AC');
	expect(parseUrl('https://example.com/a%20b')).toBe('https://example.com/a%20b');
	expect(parseUrl('https://example.com/100%.md')).toBe('https://example.com/100%25.md');
	expect(parseUrl("https://example.com/a'b(c)*d!e~f")).toBe(
		'https://example.com/a%27b%28c%29%2Ad%21e~f',
	);
	expect(parseUrl('https://例え.com/パス')).toBe('https://例え.com/%E3%83%91%E3%82%B9');
	expect(parseUrl('https://example.com/a?b=c&d=e#frag')).toBe(
		'https://example.com/a?b=c&d=e#frag',
	);
	expect(parseUrl('https://example.com/a/')).toBe('https://example.com/a');
	expect(parseUrl('https://example.com/')).toBe('https://example.com');
	expect(parseUrl('https://example.com/a//?q=1#f')).toBe('https://example.com/a?q=1#f');
	expect(parseUrl('https://example.com/a b?x=a b#frag ment')).toBe(
		'https://example.com/a%20b?x=a%20b#frag%20ment',
	);
	expect(() => parseUrl('Notes/a b.md')).toThrow('Invalid URL Notes/a b.md');
	expect(parseUrl('Notes/a b.md', true)).toBe('Notes/a%20b.md');
	expect(parseUrl('/remote.php/dav/a?b.md', true)).toBe('/remote.php/dav/a%3Fb.md');
	expect(() => parseUrl('https://example.com/%E3%83')).toThrow(
		'Invalid URL https://example.com/%E3%83',
	);
});

test('formats urls', () => {
	expect(formatUrl('https://example.com/%E2%82%AC')).toBe('https://example.com/€');
	expect(formatUrl('https://example.com/a%20b?x=a%20b')).toBe('https://example.com/a b?x=a b');
	expect(formatUrl('https://example.com/100%25.md')).toBe('https://example.com/100%.md');
	expect(formatUrl('https://example.com/a%20b#frag%20ment')).toBe(
		'https://example.com/a b#frag ment',
	);
	expect(formatUrl('https://例え.com/x')).toBe('https://例え.com/x');
	expect(formatUrl('Notes/a%20b.md')).toBe('Notes/a b.md');
});

test('strips trailing slash', () => {
	expect(stripEndSlash('folder/')).toBe('folder');
	expect(stripEndSlash('folder')).toBe('folder');
});
