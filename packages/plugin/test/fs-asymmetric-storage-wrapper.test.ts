import testKit from '$/test-kit';
import { beforeEach, expect, test } from 'bun:test';
import { openMemoryDB } from 'uni-kv';
import type { Stat } from '@/types';
import { asymmetricStorageWrapper } from '@/fs';
import { STORAGE_NAME } from '@/modules/Storage';

const { bytes, file, folder, fs } = testKit;

const db = openMemoryDB<
	{ remoteStatContext: Stat },
	Record<'lastLocalContextUid' | 'lastRemoteContextUid', string>
>(STORAGE_NAME);

const store = db.getStore('remoteStatContext');

function seedRemoteContext(...stats: Array<Stat>) {
	store.clear();
	for (const stat of stats) store.set(stat.key, stat);
}

beforeEach(() => {
	db.clearStores();
	store.clear();
	db.setMeta('lastLocalContextUid', '');
	db.setMeta('lastRemoteContextUid', '');
});

test('list should infer folder anchors from remoteStatContext and return hierarchical stats', async () => {
	seedRemoteContext(file('00000abcde~folder'), file('abcdeuvwxy~nested'));
	const remote = fs({
		control: {
			list: () => [
				folder('/'),
				file('00000~root.md', { size: 1, uid: 'root-file' }),
				file('00000abcde~folder', { size: 0, uid: 'folder-marker' }),
				file('abcde~child.md', { size: 2, uid: 'child-file' }),
				file('abcdeuvwxy~nested', { size: 0, uid: 'nested-marker' }),
				file('uvwxy~deep.md', { size: 3, uid: 'deep-file' }),
			],
		},
	});
	const wrapper = asymmetricStorageWrapper(remote.fs, store);

	expect(await wrapper.list('/', () => 'include')).toStrictEqual([
		file('root.md', { size: 1, uid: 'root-file' }),
		folder('folder/'),
		file('folder/child.md', { size: 2, uid: 'child-file' }),
		folder('folder/nested/'),
		file('folder/nested/deep.md', { size: 3, uid: 'deep-file' }),
	]);
	expect(remote.calls.list).toStrictEqual(['/']);
});

test('list should throw when encountering too many malformed or orphan flattened entries without proceeding', () => {
	seedRemoteContext(file('00000abcde~folder'));
	const remote = fs({
		control: {
			list: () => [
				file('bad-key', { size: 1, uid: 'bad' }),
				file('zzzzz~lost.md', { size: 2, uid: 'orphan-file' }),
				file('zzzzzqqqqq~ghost', { size: 0, uid: 'orphan-folder' }),
				file('00000abcde~folder', { size: 0, uid: 'folder-marker' }),
				file('abcde~child.md', { size: 4, uid: 'child' }),
			],
		},
	});
	const wrapper = asymmetricStorageWrapper(remote.fs, store);

	expect(() => wrapper.list('/', () => 'include')).toThrow(
		"There are too many files at remote that don't adopt asymmetric storage, maybe you want to turn it off in settings.",
	);
});

test('mkdir should write empty folder marker file and reuse same generated anchor later', async () => {
	const remote = fs();
	const wrapper = asymmetricStorageWrapper(remote.fs, store);
	const noteStat = file('folder/note.md', { uid: 'note-uid' });

	await wrapper.mkdir('folder/');
	await wrapper.write('folder/note.md', bytes('1234'), noteStat);

	const [[folderMarkerKey, folderMarkerValue], [childKey, childValue]] = remote.calls.write;
	expect(folderMarkerValue).toStrictEqual(bytes(''));
	expect(folderMarkerKey.slice(0, 5)).toBe('00000');
	expect(folderMarkerKey[10]).toBe('~');
	expect(folderMarkerKey.slice(11)).toBe('folder');
	expect(childKey).toBe(`${folderMarkerKey.slice(5, 10)}~note.md`);
	expect(childValue).toStrictEqual(bytes('1234'));
});

test('mkdir should reuse bootstrapped anchor instead of generating a colliding one', async () => {
	seedRemoteContext(file('00000abcde~folder'));
	const remote = fs();
	const wrapper = asymmetricStorageWrapper(remote.fs, store);
	const noteStat = file('folder/note.md', { uid: 'note-uid' });

	await wrapper.mkdir('folder/');
	await wrapper.write('folder/note.md', bytes('x'), noteStat);

	expect(remote.calls.write).toStrictEqual([
		[
			'00000abcde~folder',
			bytes(''),
			{
				isDir: false,
				key: '00000abcde~folder',
				mtime: 0,
				size: 0,
				// oxlint-disable-next-line typescript/no-unsafe-assignment
				uid: expect.any(String),
			},
		],
		['abcde~note.md', bytes('x'), noteStat],
	]);
});

test('folder move should preserve anchor and short-circuit identical flattened move', async () => {
	seedRemoteContext(file('00000abcde~folder'));
	const remote = fs();
	const wrapper = asymmetricStorageWrapper(remote.fs, store);
	const childStat = file('renamed/child.md', { uid: 'child-uid' });

	await wrapper.move('folder/', 'renamed/');
	await wrapper.write('renamed/child.md', bytes('x'), childStat);
	await wrapper.move('renamed/', 'renamed/');

	expect(remote.calls.move).toStrictEqual([['00000abcde~folder', '00000abcde~renamed']]);
	expect(remote.calls.write).toStrictEqual([['abcde~child.md', bytes('x'), childStat]]);
});
