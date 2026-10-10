import type { Fs, RequestParam } from '@hesprs/sync-engine-sdk';
import { testKit } from '@hesprs/sync-engine-sdk/dev';
import { expect, test } from 'bun:test';
import MetadataRemoteFs, { RemoteSession, remoteMiddleware, UploadRemoteFs } from '../src/remote';
import { getTarget } from '../src/target';

const { bytes, deferred, file, flush, folder, fs, request, stream } = testKit;
const mtime = 1_700_000_123_456;
const ctime = 1_500_000_000_000;
function requireTarget(settings: Parameters<typeof getTarget>[0]) {
	const result = getTarget(settings);
	if (!result) throw new Error('Missing test target');
	return result;
}
const target = requireTarget({
	modules: { s3: { bucket: 'vault', endpoint: 'https://s3.example', urlStyle: 'path' } },
	remoteFs: 's3',
});
const davTarget = requireTarget({
	modules: { webdav: { endpoint: 'https://dav.example/dav/ignis' } },
	remoteFs: 'webdav',
});

function source(key: string, modified = mtime) {
	return file(key, { meta: () => ({ ctime: String(ctime), mtime: String(modified) }) });
}

function wrapRemote(original: Fs, session: RemoteSession) {
	return new MetadataRemoteFs(new UploadRemoteFs(original, session), session);
}

test('parallel uploads bind SDK metadata to the full object URL and return backend UIDs', async () => {
	const session = new RemoteSession(target, () => true);
	const pending = new Map<string, ReturnType<typeof deferred<void>>>();
	const http = request(async (url) => {
		const wait = deferred<void>();
		pending.set(url, wait);
		await wait.promise;
		return { headers: { etag: 'backend-uid' } };
	});
	const send = remoteMiddleware(http.request, session);
	const backend = fs({
		control: {
			write: async (key, body) =>
				(await send(target.url(key), { body, method: 'PUT' })).headers.etag,
		},
	});
	const wrapped = wrapRemote(backend.fs, session);
	const first = wrapped.write('a/相同 #%.md', bytes('a'), source('source-a'));
	const second = wrapped.write('b/相同 #%.md', bytes('b'), source('source-b', mtime + 1234));
	await flush();
	const unrelated = send('https://other.example/vault/a/相同.md', { method: 'PUT' });
	expect(http.calls.map(({ headers }) => headers?.['X-Amz-Meta-Mtime'])).toEqual([
		String(mtime / 1000),
		String((mtime + 1234) / 1000),
		undefined,
	]);
	for (const wait of pending.values()) wait.resolve();
	expect(
		await Promise.all([first, second, unrelated]).then((values) => values.slice(0, 2)),
	).toEqual(['backend-uid', 'backend-uid']);
	expect(http.calls).toHaveLength(3);
	expect(session.uploading.size).toBe(0);
});

test('S3 injects only object PUT and multipart initiation, before backend signing', async () => {
	const session = new RemoteSession(target, () => true);
	const address = target.url('big.bin');
	session.uploading.set(address, { ctime, mtime });
	const http = request(() => ({}));
	const send = remoteMiddleware(http.request, session);
	const operations: Array<[string, RequestParam]> = [
		[address, { headers: { 'x-amz-meta-mtime': 'wrong' }, method: 'PUT' }],
		[`${address}?uploads=`, { method: 'POST' }],
		[`${address}?partNumber=1&uploadId=id`, { method: 'PUT' }],
		[`${address}?uploadId=id`, { method: 'POST' }],
		[`${address}?uploadId=id`, { ignoreCancellation: true, method: 'DELETE' }],
		[address, { headers: { 'x-amz-copy-source': '/vault/old.bin' }, method: 'PUT' }],
	];
	for (const [url, params] of operations) await send(url, params);
	expect(http.calls.map(({ headers }) => headers?.['X-Amz-Meta-Mtime'])).toEqual([
		String(mtime / 1000),
		String(mtime / 1000),
		undefined,
		undefined,
		undefined,
		undefined,
	]);
	expect(http.calls[0].headers).not.toHaveProperty('x-amz-meta-mtime');
	expect(http.calls[0].headers).not.toHaveProperty('X-Amz-Meta-Ctime');
	expect(http.calls[4].ignoreCancellation).toBe(true);
});

test('upload failures propagate without retries or UID lookups and release state', async () => {
	const session = new RemoteSession(target, () => true);
	const failure = new Error('backend failed');
	const http = request(() => ({}));
	const send = remoteMiddleware(http.request, session);
	const backend = fs({
		control: {
			write: async (key) => {
				await send(target.url(key), { method: 'PUT' });
				throw failure;
			},
		},
	});
	const wrapped = wrapRemote(backend.fs, session);
	expect(await wrapped.write('a', bytes('a'), source('a')).catch((error: unknown) => error)).toBe(
		failure,
	);
	expect(http.calls).toHaveLength(1);
	expect(http.calls[0].headers?.['X-Amz-Meta-Mtime']).toBe(String(mtime / 1000));
	expect(session.uploading.size).toBe(0);
	await send(target.url('a'), { method: 'PUT' });
	expect(http.calls.at(-1)?.headers).not.toHaveProperty('X-Amz-Meta-Mtime');
});

test.each(['', ' ', 'invalid', 'Infinity', '9000000000000000'])(
	'missing or invalid SDK times are omitted without using stat.mtime (%s)',
	async (time) => {
		const session = new RemoteSession(target, () => true);
		const http = request(() => ({}));
		const send = remoteMiddleware(http.request, session);
		const wrapped = wrapRemote(
			fs({
				control: {
					write: async (key) => {
						await send(target.url(key), { method: 'PUT' });
						return 'uid';
					},
				},
			}).fs,
			session,
		);
		await wrapped.write(
			'a',
			bytes('a'),
			file('a', {
				meta: () => ({ ctime: time, mtime: time }),
				mtime,
			}),
		);
		await wrapped.write('generated', bytes('merge'), file('generated', { mtime }));
		expect(http.calls.every(({ headers }) => headers?.['X-Amz-Meta-Mtime'] === undefined)).toBe(
			true,
		);
	},
);

test('metadata failures propagate before starting an upload', async () => {
	const failure = new Error('metadata unavailable');
	const backend = fs();
	const wrapped = new MetadataRemoteFs(backend.fs, new RemoteSession(target, () => true));
	const stat = { ...source('a'), meta: () => Promise.reject(failure) };
	expect(await wrapped.write('a', bytes('a'), stat).catch((error: unknown) => error)).toBe(
		failure,
	);
	expect(backend.calls.write).toHaveLength(0);
});

test.each([target, davTarget])(
	'$kind discovery preserves valid ctime and uses only standard mtime',
	async (configured) => {
		const original = file('a', {
			meta: () => ({ ctime: String(ctime), custom: 'retained', mtime: '123' }),
			mtime,
			uid: 'backend-uid',
		});
		const dir = folder('dir/', () => ({ mtime: 'folder-time' }));
		const backend = fs({ control: { list: () => [original, dir], stat: () => original } });
		const wrapped = new MetadataRemoteFs(backend.fs, new RemoteSession(configured, () => true));
		const listed = await wrapped.list('/', () => 'advance');
		const stat = await wrapped.stat('a');
		for (const item of [listed[0], stat]) {
			expect(item).toMatchObject({ key: 'a', mtime, uid: 'backend-uid' });
			expect(await item.meta()).toEqual({
				ctime: String(ctime),
				custom: 'retained',
				mtime: String(mtime),
			});
		}
		expect(listed[1]).toBe(dir);
		expect(await original.meta()).toEqual({
			ctime: String(ctime),
			custom: 'retained',
			mtime: '123',
		});
	},
);

test('invalid standard time does not fall back to custom metadata', async () => {
	const backend = fs({
		control: {
			stat: () =>
				file('a', {
					meta: () => ({ ctime: String(ctime), mtime: String(mtime) }),
					mtime: Number.NaN,
				}),
		},
	});
	const wrapped = new MetadataRemoteFs(backend.fs, new RemoteSession(target, () => true));
	expect(await (await wrapped.stat('a')).meta()).toEqual({ ctime: String(ctime) });
});

test('WebDAV applies available times to PUT and final chunk MOVE using Destination', async () => {
	const session = new RemoteSession(davTarget, () => true);
	const destination = davTarget.url('note.md');
	session.uploading.set(destination, { ctime, mtime });
	const http = request(() => ({}));
	const send = remoteMiddleware(http.request, session);
	await send(destination, { method: 'PUT' });
	await send('https://dav.example/uploads/admin/session/.file', {
		headers: { Destination: destination },
		method: 'MOVE',
	});
	await send(destination, { method: 'DELETE' });
	await send(davTarget.url('other.md'), {
		headers: { Destination: destination },
		method: 'MOVE',
	});
	session.uploading.set(destination, { mtime: 0 });
	await send(destination, { method: 'PUT' });
	await send('https://dav.example/uploads/admin/session/00001', {
		headers: { Destination: destination },
		method: 'PUT',
	});
	expect(http.calls.map(({ headers }) => headers?.['X-OC-Mtime'])).toEqual([
		'1700000123',
		'1700000123',
		undefined,
		undefined,
		'0',
		undefined,
	]);
	expect(http.calls[1].headers?.['X-OC-Ctime']).toBe('1500000000');
	expect(http.calls[4].headers).not.toHaveProperty('X-OC-Ctime');
});

test('disabling while reading source metadata delegates the original metadata', async () => {
	let enabled = true;
	const pending = deferred<Record<string, string>>();
	const original = { ...source('a'), meta: () => pending.promise };
	const backend = fs();
	const wrapped = new MetadataRemoteFs(backend.fs, new RemoteSession(target, () => enabled));
	const write = wrapped.write('a', bytes('a'), original);
	enabled = false;
	pending.resolve({ ctime: String(ctime), mtime: String(mtime) });
	expect(await write).toBe('write-uid');
	expect(backend.calls.write[0][2]).toBe(original);
});

test('streamed uploads delegate the original stream and preserve the backend result', async () => {
	const session = new RemoteSession(davTarget, () => true);
	const value = stream(['body']);
	const http = request(() => ({}));
	const send = remoteMiddleware(http.request, session);
	const backend = fs({
		control: {
			writeStream: async (key, received) => {
				expect(received).toBe(value);
				await send(davTarget.url(key), { method: 'PUT' });
				return 'backend-stream-uid';
			},
		},
	});
	const wrapped = wrapRemote(backend.fs, session);
	const stat = source('a');
	expect(await wrapped.writeStream('a', value, stat)).toBe('backend-stream-uid');
	expect(backend.calls.writeStream[0][0]).toBe('a');
	expect(await backend.calls.writeStream[0][1].meta()).toEqual({ ctime: String(ctime) });
	expect(await stat.meta()).toEqual({ ctime: String(ctime), mtime: String(mtime) });
	expect(http.calls[0].headers).toMatchObject({ 'X-OC-Ctime': '1500000000' });
	expect(session.uploading.size).toBe(0);
	await value.cancel();
});

test('target mapping respects path style, virtual hosts, encoded names and endpoint boundaries', () => {
	expect(target.url('prefix/笔记 #%.md')).toBe(
		'https://s3.example/vault/prefix/%E7%AC%94%E8%AE%B0%20%23%25.md',
	);
	expect(target.contains('https://s3.example/vault-other/a')).toBe(false);
	expect(davTarget.contains('https://other.example/dav/ignis/a')).toBe(false);
	const virtual = requireTarget({
		modules: {
			s3: {
				bucket: 'vault',
				endpoint: 'https://s3.example/ignored',
				urlStyle: 'virtualHosted',
			},
		},
		remoteFs: 's3',
	});
	expect(virtual.url('a')).toBe('https://vault.s3.example/a');
	expect(getTarget({ modules: {}, remoteFs: 'gdrive' })).toBeUndefined();
});
