import type { DatabaseSync } from 'uni-kv';
import testKit from '$/test-kit';
import { beforeEach, expect, test } from 'bun:test';
import { openMemoryDB } from 'uni-kv';
import type { Fs } from '@/fs';
import type { FileStat, Stat } from '@/types';
import { contextWrapper } from '@/fs';
import { STORAGE_NAME } from '@/modules/Storage';

const { bytes, file, folder, fs, stream } = testKit;
type ContextMemoryDB = DatabaseSync<
	{ localStatContext: Stat; remoteStatContext: Stat },
	{ lastLocalContextUid: string; lastRemoteContextUid: string }
>;
const db: ContextMemoryDB = openMemoryDB(STORAGE_NAME);

function remoteContextWrapper(rootFs: Fs) {
	return contextWrapper(rootFs, {
		db,
		marker: 'lastRemoteContextUid',
		store: 'remoteStatContext',
	});
}

function localContextWrapper(rootFs: Fs) {
	return contextWrapper(rootFs, {
		db,
		marker: 'lastLocalContextUid',
		store: 'localStatContext',
	});
}

function getLocalStore() {
	return db.getStore('localStatContext');
}

function getRemoteStore() {
	return db.getStore('remoteStatContext');
}

function getStoreSnapshot(store: ReturnType<typeof getLocalStore>) {
	const result: Record<string, Stat> = {};
	for (const key of store.keys()) {
		const value = store.get(key);
		if (value !== undefined) result[key] = value;
	}
	return result;
}

beforeEach(() => {
	db.clearStores();
	db.setMeta('lastLocalContextUid', '');
	db.setMeta('lastRemoteContextUid', '');
});

test('remote context wrapper clears stale context when uid changes at creation', () => {
	const remote = fs({ uid: 'new-remote' });
	getRemoteStore().set('stale.md', file('stale.md'));
	getLocalStore().set('keep.md', file('keep.md'));
	db.setMeta('lastRemoteContextUid', 'old-remote');

	remoteContextWrapper(remote.fs);

	expect(getStoreSnapshot(getRemoteStore())).toStrictEqual({});
	expect(getStoreSnapshot(getLocalStore())).toStrictEqual({ 'keep.md': file('keep.md') });
	expect(db.getMeta('lastRemoteContextUid')).toBe('new-remote');
});

test('remote context wrapper keeps context when uid matches at creation', () => {
	const remote = fs({ uid: 'same-remote' });
	getRemoteStore().set('keep.md', file('keep.md'));
	db.setMeta('lastRemoteContextUid', 'same-remote');

	remoteContextWrapper(remote.fs);

	expect(getStoreSnapshot(getRemoteStore())).toStrictEqual({ 'keep.md': file('keep.md') });
	expect(db.getMeta('lastRemoteContextUid')).toBe('same-remote');
});

test('local context wrapper clears stale context when uid changes at creation', () => {
	const local = fs({ uid: 'new-local' });
	getLocalStore().set('stale.md', file('stale.md'));
	getRemoteStore().set('keep.md', file('keep.md'));
	db.setMeta('lastLocalContextUid', 'old-local');

	localContextWrapper(local.fs);

	expect(getStoreSnapshot(getLocalStore())).toStrictEqual({});
	expect(getStoreSnapshot(getRemoteStore())).toStrictEqual({ 'keep.md': file('keep.md') });
	expect(db.getMeta('lastLocalContextUid')).toBe('new-local');
});

test('stat caches returned file stat', async () => {
	const remote = fs();
	const local = fs();
	const remoteWrapper = remoteContextWrapper(remote.fs);
	const localWrapper = localContextWrapper(local.fs);
	const remoteResult = file('remote.md', { size: 7, uid: 'remote-file' });
	const localResult = file('local.md', { size: 9, uid: 'local-file' });
	remote.control.stat = () => remoteResult;
	local.control.stat = () => localResult;

	await remoteWrapper.stat('remote.md');
	await localWrapper.stat('local.md');

	expect(getRemoteStore().get('remote.md')).toStrictEqual(remoteResult);
	expect(getLocalStore().get('local.md')).toStrictEqual(localResult);
});

test('list replaces previous context snapshot', async () => {
	const remote = fs();
	const local = fs();
	const remoteWrapper = remoteContextWrapper(remote.fs);
	const localWrapper = localContextWrapper(local.fs);
	const remoteStats = [
		folder('remote/'),
		file('remote/file.md', { size: 11, uid: 'remote-list-all' }),
	];
	const localStats = [
		folder('local/'),
		file('local/file.md', { size: 12, uid: 'local-list-all' }),
	];
	getRemoteStore().set('old-remote.md', file('old-remote.md'));
	getLocalStore().set('old-local.md', file('old-local.md'));
	remote.control.list = () => remoteStats;
	local.control.list = () => localStats;

	await remoteWrapper.list('/', () => 'include');
	await localWrapper.list('/', () => 'include');

	expect(getStoreSnapshot(getRemoteStore())).toStrictEqual({
		'remote/': remoteStats[0],
		'remote/file.md': remoteStats[1],
	});
	expect(getStoreSnapshot(getLocalStore())).toStrictEqual({
		'local/': localStats[0],
		'local/file.md': localStats[1],
	});
});

test('stat and traversal failures do not mutate context', () => {
	const remote = fs();
	const local = fs();
	const remoteWrapper = remoteContextWrapper(remote.fs);
	const localWrapper = localContextWrapper(local.fs);
	const remoteSeed = file('seed-remote.md', { size: 3, uid: 'seed-remote' });
	const localSeed = file('seed-local.md', { size: 4, uid: 'seed-local' });
	getRemoteStore().set(remoteSeed.key, remoteSeed);
	getLocalStore().set(localSeed.key, localSeed);
	remote.control.stat = () => Promise.reject(new Error('remote stat failed'));
	remote.control.list = () => Promise.reject(new Error('remote list failed'));
	local.control.stat = () => Promise.reject(new Error('local stat failed'));
	local.control.list = () => Promise.reject(new Error('local list failed'));

	expect(remoteWrapper.stat('remote.md')).rejects.toThrow('remote stat failed');
	expect(remoteWrapper.list('/', () => 'include')).rejects.toThrow('remote list failed');
	expect(localWrapper.stat('local.md')).rejects.toThrow('local stat failed');
	expect(localWrapper.list('/', () => 'include')).rejects.toThrow('local list failed');

	expect(getStoreSnapshot(getRemoteStore())).toStrictEqual({ 'seed-remote.md': remoteSeed });
	expect(getStoreSnapshot(getLocalStore())).toStrictEqual({ 'seed-local.md': localSeed });
});

test('write upserts synthesized file stat', async () => {
	const remote = fs();
	const local = fs();
	const remoteWrapper = remoteContextWrapper(remote.fs);
	const localWrapper = localContextWrapper(local.fs);
	const remoteStat = file('remote-write.md', { size: 3, uid: 'remote-write' });
	const localStat = file('local-write.md', { size: 4, uid: 'local-write' });

	await remoteWrapper.write('remote-write.md', bytes('123'), remoteStat);
	await localWrapper.write('local-write.md', bytes('1234'), localStat);

	const remoteWrite = getRemoteStore().get('remote-write.md') as FileStat;
	expect(remoteWrite).toStrictEqual(
		file('remote-write.md', { mtime: remoteWrite.mtime, size: 3, uid: 'write-uid' }),
	);
	const localWrite = getLocalStore().get('local-write.md') as FileStat;
	expect(localWrite).toStrictEqual(
		file('local-write.md', { mtime: localWrite.mtime, size: 4, uid: 'write-uid' }),
	);
});

test('writeStream upserts synthesized file stat', async () => {
	const local = fs();
	const localWrapper = localContextWrapper(local.fs);
	const stat = file('local-stream.md', { uid: 'local-stream' });

	await localWrapper.writeStream('local-stream.md', stream(['ab', 'cd']), stat);

	const write = getLocalStore().get('local-stream.md') as FileStat;
	expect(write).toStrictEqual(file('local-stream.md', { mtime: write.mtime, uid: 'stream-uid' }));
});

test('delete removes cached record', async () => {
	const remote = fs();
	const local = fs();
	const remoteWrapper = remoteContextWrapper(remote.fs);
	const localWrapper = localContextWrapper(local.fs);
	getRemoteStore().set('remote-delete.md', file('remote-delete.md'));
	getLocalStore().set('local-delete.md', file('local-delete.md'));

	await remoteWrapper.delete('remote-delete.md');
	await localWrapper.delete('local-delete.md');

	expect(getStoreSnapshot(getRemoteStore())).toStrictEqual({});
	expect(getStoreSnapshot(getLocalStore())).toStrictEqual({});
});

test('move rewrites cached stat key', async () => {
	const remote = fs();
	const local = fs();
	const remoteWrapper = remoteContextWrapper(remote.fs);
	const localWrapper = localContextWrapper(local.fs);
	const remoteStat = file('remote-old.md', { mtime: 2, size: 6, uid: 'remote-old' });
	const localStat = file('local-old.md', { mtime: 3, size: 7, uid: 'local-old' });
	getRemoteStore().set(remoteStat.key, remoteStat);
	getLocalStore().set(localStat.key, localStat);

	await remoteWrapper.move('remote-old.md', 'remote-new.md');
	await localWrapper.move('local-old.md', 'local-new.md');

	expect(getRemoteStore().get('remote-new.md')).toStrictEqual(
		file('remote-new.md', { mtime: 2, size: 6, uid: 'remote-old' }),
	);
	expect(getLocalStore().get('local-new.md')).toStrictEqual(
		file('local-new.md', { mtime: 3, size: 7, uid: 'local-old' }),
	);
	expect(getRemoteStore().get('remote-old.md')).toBeUndefined();
	expect(getLocalStore().get('local-old.md')).toBeUndefined();
});

test('mkdir upserts folder record', async () => {
	const remote = fs();
	const local = fs();
	const remoteWrapper = remoteContextWrapper(remote.fs);
	const localWrapper = localContextWrapper(local.fs);

	await remoteWrapper.mkdir('remote-folder/', true);
	await localWrapper.mkdir('local-folder/');

	expect(getRemoteStore().get('remote-folder/')).toStrictEqual(folder('remote-folder/'));
	expect(getLocalStore().get('local-folder/')).toStrictEqual(folder('local-folder/'));
});
