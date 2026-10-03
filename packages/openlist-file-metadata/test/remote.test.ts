import type { FileStat, RequestParam } from '@hesprs/sync-engine-sdk';
import { testKit } from '@hesprs/sync-engine-sdk/dev';
import { expect, test } from 'bun:test';
import MetadataRemoteFs, { RemoteSession, remoteMiddleware } from '../src/remote';
import { getTarget } from '../src/target';
import { attachTimes, getTimes } from '../src/times';

const { bytes, deferred, file, fs, request, stream } = testKit;
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

test('parallel writes bind times to the full object URL and leave ordinary requests alone', async () => {
	const session = new RemoteSession(target, () => true);
	const pending = new Map<string, ReturnType<typeof deferred<void>>>();
	const http = request(async (url) => {
		const wait = deferred<void>();
		pending.set(url, wait);
		await wait.promise;
		return { headers: { etag: 'uploaded' } };
	});
	const send = remoteMiddleware(http.request, session);
	const backend = fs({
		control: {
			write: async (key, body) =>
				(await send(target.url(key), { body, method: 'PUT' })).headers.etag,
		},
	});
	const wrapped = new MetadataRemoteFs(backend.fs, session);
	const first = wrapped.write(
		'a/相同 #%.md',
		bytes('a'),
		attachTimes(file('a/相同 #%.md'), { ctime, mtime }),
	);
	const second = wrapped.write(
		'b/相同 #%.md',
		bytes('b'),
		attachTimes(file('b/相同 #%.md'), { mtime: mtime + 1234 }),
	);
	const unrelated = send('https://other.example/vault/a/相同.md', { method: 'PUT' });
	expect(http.calls.map(({ headers }) => headers?.['X-Amz-Meta-Mtime'])).toEqual([
		String(mtime / 1000),
		String((mtime + 1234) / 1000),
		undefined,
	]);
	for (const wait of pending.values()) wait.resolve();
	await Promise.all([first, second, unrelated]);
	expect(session.uploading.size).toBe(0);
	expect(backend.calls.write.map(([key]) => key)).toEqual(['a/相同 #%.md', 'b/相同 #%.md']);
});

test('S3 injects only PUT object and multipart initiation, replacing differently cased headers', async () => {
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

test('failed uploads clean state, retries keep headers, and generated content has no invented time', async () => {
	const session = new RemoteSession(target, () => true);
	const http = request(() => ({ status: 500 }));
	const send = remoteMiddleware(http.request, session);
	const backend = fs({
		control: {
			write: async (key) => {
				await send(target.url(key), { method: 'PUT' });
				await send(target.url(key), { method: 'PUT' });
				throw new Error('failed');
			},
		},
	});
	const wrapped = new MetadataRemoteFs(backend.fs, session);
	expect(
		await wrapped
			.write('a', bytes('a'), attachTimes(file('a'), { mtime }))
			.catch((error: unknown) => error),
	).toMatchObject({ message: 'failed' });
	expect(session.uploading.size).toBe(0);
	expect(http.calls.map(({ headers }) => headers?.['X-Amz-Meta-Mtime'])).toEqual([
		String(mtime / 1000),
		String(mtime / 1000),
	]);
	await send(target.url('a'), { method: 'PUT' });
	expect(http.calls.at(-1)?.headers).not.toHaveProperty('X-Amz-Meta-Mtime');
	expect(
		await wrapped
			.write('generated', bytes('merge'), file('generated', { mtime: 0 }))
			.catch((error: unknown) => error),
	).toMatchObject({ message: 'failed' });
	expect(http.calls.at(-1)?.headers).not.toHaveProperty('X-Amz-Meta-Mtime');
});

test('S3 download prefers preserved metadata and falls back for invalid metadata', async () => {
	const session = new RemoteSession(target, () => true);
	let custom = String(mtime / 1000);
	const http = request(() => ({
		headers: {
			'Last-Modified': new Date(mtime).toUTCString(),
			'X-Amz-Meta-Mtime': custom,
		},
	}));
	const send = remoteMiddleware(http.request, session);
	const backend = fs({
		control: {
			read: async (key) => (await send(target.url(key))).bytes(),
			readStream: () => stream(['body']),
		},
	});
	const wrapped = new MetadataRemoteFs(backend.fs, session);
	const source = file('a', { mtime: Math.floor(mtime / 1000) * 1000 });
	await wrapped.read('a', source);
	expect(getTimes(source)).toEqual({ ctime: undefined, mtime });
	custom = 'invalid';
	await wrapped.read('a', source);
	expect(getTimes(source)?.mtime).toBe(Math.floor(mtime / 1000) * 1000);
	custom = String(mtime / 1000);
	const received = await wrapped.readStream('a', source);
	expect(http.calls.at(-1)?.method).toBe('HEAD');
	expect(getTimes(source)?.mtime).toBe(mtime);
	await received.cancel();
});

test('missing response dates keep discovered mtime without restoring cached local ctime on S3', async () => {
	const session = new RemoteSession(target, () => true);
	const http = request(() => ({}));
	const send = remoteMiddleware(http.request, session);
	const backend = fs({ control: { read: async (key) => (await send(target.url(key))).bytes() } });
	const wrapped = new MetadataRemoteFs(backend.fs, session);
	const cached = attachTimes(file('a', { mtime }), { ctime, mtime });
	await wrapped.read('a', cached);
	expect(getTimes(cached)).toEqual({ ctime: undefined, mtime });
});

const davTarget = requireTarget({
	modules: { webdav: { endpoint: 'https://dav.example/dav/ignis' } },
	remoteFs: 'webdav',
});
const davXml = (created = '2017-07-14T02:40:00Z') => `<?xml version="1.0"?>
<D:multistatus xmlns:D="DAV:"><D:response><D:href>/dav/ignis/dir/note%20%23.md</D:href>
<D:propstat><D:prop><D:creationdate>invalid</D:creationdate></D:prop><D:status>HTTP/1.1 404 Not Found</D:status></D:propstat>
<D:propstat><D:prop><D:creationdate>${created}</D:creationdate><D:getlastmodified>Tue, 14 Nov 2023 22:15:23 GMT</D:getlastmodified></D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat>
</D:response></D:multistatus>`;

test('WebDAV requests creationdate and decorates stats without changing keys or UIDs', async () => {
	const session = new RemoteSession(davTarget, () => true);
	let xml = davXml();
	const http = request(() => ({ status: 207, text: () => xml }));
	const send = remoteMiddleware(http.request, session);
	const source = file('dir/note #.md', { mtime: 1_700_000_123_000 });
	const backend = fs({
		control: {
			list: async () => {
				await send(davTarget.url('/'), {
					body: '<D:propfind xmlns:D="DAV:"><D:prop><D:getlastmodified/></D:prop></D:propfind>',
					method: 'PROPFIND',
				});
				return [{ ...source }];
			},
		},
	});
	const wrapped = new MetadataRemoteFs(backend.fs, session);
	const [stat] = await wrapped.list('/', () => 'advance');
	expect(http.calls[0].body).toContain('<creationdate xmlns="DAV:"/>');
	expect(stat).toMatchObject(source);
	expect(getTimes(stat as FileStat)).toEqual({ ctime, mtime: 1_700_000_123_000 });
	xml = davXml('invalid');
	const [invalid] = await wrapped.list('/', () => 'advance');
	expect(getTimes(invalid as FileStat)?.ctime).toBeUndefined();
});

test('WebDAV applies second precision to PUT and final chunk MOVE using Destination', async () => {
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
	expect(http.calls.map(({ headers }) => headers?.['X-OC-Mtime'])).toEqual([
		'1700000123',
		'1700000123',
		undefined,
		undefined,
	]);
	expect(http.calls[1].headers?.['X-OC-Ctime']).toBe('1500000000');
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
