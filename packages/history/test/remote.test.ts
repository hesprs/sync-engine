import { buildCommitLog } from '@/head-log';
import { openRemoteHistory } from '@/remote';
import { expect, test } from 'bun:test';
import type { Binary, FileStat, FolderStat, Fs, ListReporter, Stat } from '@hesprs/sync-engine-sdk';

function httpError(message: string, status: number): Error & { status: number } {
	const error = new Error(message) as Error & { status: number };
	error.status = status;
	return error;
}

function fakeFs(
	options: { listError?: Error; readError?: Error; store?: Map<string, Uint8Array> } = {},
) {
	const store = options.store ?? new Map<string, Uint8Array>();
	const listedKeys: Array<string> = [];
	const fs: Fs = {
		delete(key) {
			store.delete(key);
			return Promise.resolve();
		},
		exists: (key) => Promise.resolve(store.has(key)),
		getUid: () => 'root',
		list(key: string, _reporter: ListReporter): Promise<Array<Stat>> {
			listedKeys.push(key);
			if (options.listError) return Promise.reject(options.listError);
			// Enforce unified folder key contract (mirrors WebDAV/GDrive/Dropbox behavior).
			if (!key.endsWith('/'))
				return Promise.reject(
					httpError(`Expected folder key with trailing slash: ${key}`, 301),
				);
			return Promise.resolve(
				[...store.entries()]
					.filter(([name]) => name.startsWith(key))
					.map(([name, value]) => ({
						isDir: false as const,
						key: name,
						meta: () => ({}),
						mtime: 1234,
						size: value.byteLength,
						uid: `uid-${name}`,
					})),
			);
		},
		mkdir: (_key: string, _stat: FolderStat) => Promise.resolve(),
		move: () => Promise.resolve(),
		read(key: string) {
			if (options.readError) return Promise.reject(options.readError);
			const value = store.get(key);
			if (!value) return Promise.reject(httpError(`Not found: ${key}`, 404));
			return Promise.resolve(value as Binary);
		},
		readStream: () => Promise.reject(new Error('unused')),
		stat: (key: string): Promise<FileStat> =>
			Promise.reject(httpError(`Not found: ${key}`, 404)),
		write: async (key: string, value) => {
			store.set(key, new Uint8Array(await value));
			return 'uid';
		},
		writeStream: () => Promise.reject(new Error('unused')),
	};
	return { fs, listedKeys, store };
}

test('listHeads and listPacks pass trailing-slash unified folder keys and parse results', async () => {
	const { fs, listedKeys } = fakeFs();
	const remote = openRemoteHistory(fs, 'ns1', 'dev-a');
	if (!remote) throw new Error('expected remote');

	const log = await buildCommitLog({
		chunkIndex: {},
		deviceId: 'dev-a',
		generation: 1,
		heads: [],
		ns: 'ns1',
		packs: [],
		peakLamport: 1,
		seq: 1,
		updatedAt: 1000,
	});
	await remote.writeHead(log);
	await remote.putPack(1, 'abc123', new Uint8Array([1, 2, 3]));

	const heads = await remote.listHeads();
	const packs = await remote.listPacks('dev-a');

	expect(listedKeys).toStrictEqual([
		'.sync-engine-history/ns1/heads/',
		'.sync-engine-history/ns1/packs/dev-a/',
	]);
	expect(heads).toStrictEqual([
		{ deviceId: 'dev-a', mtime: 1234, uid: 'uid-.sync-engine-history/ns1/heads/dev-a.log' },
	]);
	expect(packs).toStrictEqual(['p-00000001-abc123.pack']);
});

test('listHeads and listPacks return empty arrays only for not-found errors', async () => {
	for (const notFound of [
		httpError('Not Found', 404),
		httpError('Dropbox path/not_found', 409),
	]) {
		const { fs } = fakeFs({ listError: notFound });
		const remote = openRemoteHistory(fs, 'ns1', 'dev-a');
		if (!remote) throw new Error('expected remote');
		expect(await remote.listHeads()).toStrictEqual([]);
		expect(await remote.listPacks('dev-a')).toStrictEqual([]);
	}
});

async function expectReject(promise: Promise<unknown>, snippet: string): Promise<void> {
	try {
		await promise;
	} catch (error) {
		expect(String(error)).toContain(snippet);
		return;
	}
	throw new Error(`Expected rejection containing "${snippet}"`);
}

test('listHeads and listPacks rethrow permission, redirect, and server errors', async () => {
	for (const failure of [
		httpError('WebDAV request failed: 301 PROPFIND', 301),
		httpError('S3 AccessDenied', 403),
		httpError('Internal Server Error', 500),
		new Error('network timeout'),
	]) {
		const { fs } = fakeFs({ listError: failure });
		const remote = openRemoteHistory(fs, 'ns1', 'dev-a');
		if (!remote) throw new Error('expected remote');
		await expectReject(remote.listHeads(), failure.message);
		await expectReject(remote.listPacks('dev-a'), failure.message);
	}
});

test('readHead returns undefined for Dropbox path/not_found and rethrows server errors', async () => {
	const missing = fakeFs({ readError: httpError('Dropbox path/not_found', 409) });
	const remoteMissing = openRemoteHistory(missing.fs, 'ns1', 'dev-a');
	if (!remoteMissing) throw new Error('expected remote');
	expect(await remoteMissing.readHead('dev-a')).toBeUndefined();

	const serverErr = fakeFs({ readError: httpError('Internal Server Error', 500) });
	const remoteErr = openRemoteHistory(serverErr.fs, 'ns1', 'dev-a');
	if (!remoteErr) throw new Error('expected remote');
	await expectReject(remoteErr.readHead('dev-a'), 'Internal Server Error');
});
