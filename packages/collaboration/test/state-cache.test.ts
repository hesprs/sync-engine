import RemoteStateCache from '@/state-cache';
import { expect, test } from 'bun:test';

test('marks dirty on every mutating remote operation', () => {
	const cache = new RemoteStateCache();
	expect(cache.isDirty('uid')).toBe(false);
	cache.onWrite('uid', 'note.md');
	expect(cache.isDirty('uid')).toBe(true);
	cache.clearDirty('uid');
	cache.onMkdir('uid', 'folder/');
	expect(cache.isDirty('uid')).toBe(true);
	cache.clearDirty('uid');
	cache.onDelete('uid', 'note.md');
	expect(cache.isDirty('uid')).toBe(true);
	cache.clearDirty('uid');
	cache.onMove('uid', 'a.md', 'b.md');
	expect(cache.isDirty('uid')).toBe(true);
});

test('collects changed keys and returns them sorted', () => {
	const cache = new RemoteStateCache();
	expect(cache.takeChanged('uid')).toBeUndefined();
	cache.onWrite('uid', 'z.md');
	cache.onWrite('uid', 'a.md');
	cache.onWrite('uid', 'z.md');
	cache.onMkdir('uid', 'dir/');
	expect(cache.takeChanged('uid')).toStrictEqual(['a.md', 'dir/', 'z.md']);
});

test('a move records both the old and new key', () => {
	const cache = new RemoteStateCache();
	cache.onMove('uid', 'old.md', 'new.md');
	expect(cache.takeChanged('uid')).toStrictEqual(['new.md', 'old.md']);
});

test('the root key is never collected', () => {
	const cache = new RemoteStateCache();
	cache.onMkdir('uid', '/');
	expect(cache.takeChanged('uid')).toBeUndefined();
});

test('clearing dirty also clears collected keys', () => {
	const cache = new RemoteStateCache();
	cache.onWrite('uid', 'note.md');
	cache.clearDirty('uid');
	expect(cache.takeChanged('uid')).toBeUndefined();
});

test('revision guard keeps a write made during publish dirty, with its keys', () => {
	const cache = new RemoteStateCache();
	cache.onWrite('uid', 'first.md');
	const revision = cache.getRevision('uid');
	// A newer write arrives while the pulse is being published.
	cache.onWrite('uid', 'second.md');
	cache.clearDirty('uid', revision);
	expect(cache.isDirty('uid')).toBe(true);
	expect(cache.takeChanged('uid')).toStrictEqual(['first.md', 'second.md']);
	cache.clearDirty('uid');
	expect(cache.isDirty('uid')).toBe(false);
	expect(cache.takeChanged('uid')).toBeUndefined();
});

test('clear and clearAll reset the dirty state and collected keys', () => {
	const cache = new RemoteStateCache();
	cache.onWrite('one', 'a.md');
	cache.onWrite('two', 'b.md');
	cache.clear('one');
	expect(cache.isDirty('one')).toBe(false);
	expect(cache.takeChanged('one')).toBeUndefined();
	expect(cache.isDirty('two')).toBe(true);
	expect(cache.takeChanged('two')).toStrictEqual(['b.md']);
	cache.clearAll();
	expect(cache.isDirty('two')).toBe(false);
	expect(cache.takeChanged('two')).toBeUndefined();
	expect(cache.getRevision('two')).toBe(0);
});
