import type { StoreAsync } from '@hesprs/sync-engine-sdk';
import { testKit } from '@hesprs/sync-engine-sdk/dev';
import { beforeEach, expect, test } from 'bun:test';
import { openMemoryDB } from 'uni-kv';
import smartMergeBaseTextWrapper from '@/wrapper';

const { bytes, file, fs } = testKit;
const db = openMemoryDB<{ baseText: string }>('smart-merge-wrapper-test');

function store(): StoreAsync<string> {
	return db.getStore('baseText') as never;
}

beforeEach(() => {
	db.clearStores();
});

test('write should persist mergeable base text', async () => {
	const remote = fs();
	const wrapper = smartMergeBaseTextWrapper(remote.fs, store());

	await wrapper.write(
		'folder/note.md',
		bytes('plain text'),
		file('folder/note.md', { size: 10 }),
	);
	await wrapper.write(
		'folder/long.markdown',
		bytes('markdown text'),
		file('folder/long.markdown', { size: 13 }),
	);

	expect(await store().get('folder/note.md')).toBe('plain text');
	expect(await store().get('folder/long.markdown')).toBe('markdown text');
});

test('move should move stored base text', async () => {
	const remote = fs();
	const wrapper = smartMergeBaseTextWrapper(remote.fs, store());
	await store().set('old.md', 'base text');

	await wrapper.move('old.md', 'new.md');

	expect(await store().get('old.md')).toBeUndefined();
	expect(await store().get('new.md')).toBe('base text');
});

test('delete should remove stored base text', async () => {
	const remote = fs();
	const wrapper = smartMergeBaseTextWrapper(remote.fs, store());
	await store().set('deleted.md', 'base text');

	await wrapper.delete('deleted.md');

	expect(await store().get('deleted.md')).toBeUndefined();
});

test('non mergeable write should not touch store', async () => {
	const remote = fs();
	const wrapper = smartMergeBaseTextWrapper(remote.fs, store());

	await wrapper.write('image.png', bytes('not markdown'), file('image.png', { size: 12 }));

	expect(await store().get('image.png')).toBeUndefined();
});

test('failed mutation should not update base text', async () => {
	const remote = fs({
		control: {
			write: () => {
				throw new Error('write failed');
			},
		},
	});
	const wrapper = smartMergeBaseTextWrapper(remote.fs, store());

	expect(
		wrapper.write('failed.md', bytes('body'), file('failed.md', { size: 4 })),
	).rejects.toThrow('write failed');
	expect(await store().get('failed.md')).toBeUndefined();
});
