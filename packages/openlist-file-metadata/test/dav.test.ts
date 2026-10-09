import type { Fs, Request } from '@hesprs/sync-engine-sdk';
import { testKit } from '@hesprs/sync-engine-sdk/dev';
import { expect, test } from 'bun:test';
import MetadataRemoteFs, { RemoteSession, remoteMiddleware, UploadRemoteFs } from '../src/remote';
import { getTarget } from '../src/target';

async function createRemote(request: Request, chunkedUpload = false, fileMetadata = false) {
	const source = new URL('../../webdav/src/webdav/fs.ts', import.meta.url).href;
	const { default: WebdavFs } = (await import(source)) as {
		default: new (options: Record<string, unknown>) => Fs;
	};
	const endpoint = 'https://dav.example/remote.php/dav/files/admin';
	const target = getTarget({ modules: { webdav: { endpoint } }, remoteFs: 'webdav' });
	if (!target) throw new Error('Missing target');
	const session = new RemoteSession(target, () => true);
	const raw = new WebdavFs({
		chunkedUpload,
		depthInfinity: true,
		endpoint,
		fileMetadata,
		request: remoteMiddleware(request, session),
		username: 'admin',
	});
	return { fs: new MetadataRemoteFs(new UploadRemoteFs(raw, session), session), session, target };
}

test.each(['buffered', 'streamed', 'chunked'])(
	'WebDAV resolves async native metadata once before uploading (%s)',
	async (mode) => {
		const http = testKit.request(() => ({ headers: { etag: 'uploaded' } }));
		const remote = await createRemote(http.request, mode === 'chunked', true);
		let calls = 0;
		const stat = {
			...testKit.file('note.md', { size: 4 }),
			meta: async () => {
				calls++;
				await testKit.flush(1);
				return { ctime: '1500000000000', custom: 'retained', mtime: '1700000123456' };
			},
		};
		const uid =
			mode === 'buffered'
				? await remote.fs.write('note.md', testKit.bytes('body'), stat)
				: await remote.fs.writeStream('note.md', testKit.stream(['body']), stat);
		expect(uid).toBe('uploaded');
		expect(calls).toBe(1);
		const upload = http.calls.find(
			({ method }) => method === (mode === 'chunked' ? 'MOVE' : 'PUT'),
		);
		expect(upload?.headers).toMatchObject({
			'X-OC-Ctime': '1500000000',
			'X-OC-Mtime': '1700000123',
		});
		if (mode === 'chunked') {
			expect(upload?.headers?.Destination).toBe(remote.target.url('note.md'));
			for (const part of http.calls.filter(({ method }) => method === 'PUT'))
				expect(part.headers).not.toHaveProperty('X-OC-Mtime');
		}
		const patch = http.calls.find(({ method }) => method === 'PROPPATCH');
		expect(patch?.body).toContain('"custom":"retained"');
		expect(patch?.body).toContain('"ctime":"1500000000000"');
		expect(patch?.body).not.toContain('"mtime"');
		expect(remote.session.uploading.size).toBe(0);
	},
);

test('parallel WebDAV uploads bind native times to full URLs and clean failed transfers', async () => {
	const started = testKit.deferred<void>();
	const release = testKit.deferred<void>();
	const http = testKit.request(async (_url, params) => {
		if (params.method === 'PUT') {
			if (http.calls.length === 2) started.resolve();
			await release.promise;
		}
		return { headers: { etag: 'uploaded' } };
	});
	const remote = await createRemote(http.request);
	const firstStat = {
		...testKit.file('a/same.md'),
		meta: () => Promise.resolve({ mtime: '1000123' }),
	};
	const secondStat = {
		...testKit.file('b/same.md'),
		meta: () => Promise.resolve({ mtime: '2000123' }),
	};
	const first = remote.fs.write('a/same.md', testKit.bytes('a'), firstStat);
	const second = remote.fs.write('b/same.md', testKit.bytes('b'), secondStat);
	await started.promise;
	expect(
		await Promise.resolve(remote.fs.write('a/same.md', testKit.bytes('a'), firstStat)).catch(
			(error: unknown) => error,
		),
	).toMatchObject({
		message: `Concurrent writes to the same file: ${remote.target.url('a/same.md')}`,
	});
	expect(
		await Promise.resolve(
			remote.fs.write('a/same.md', testKit.bytes('generated'), testKit.file('generated')),
		).catch((error: unknown) => error),
	).toMatchObject({
		message: `Concurrent writes to the same file: ${remote.target.url('a/same.md')}`,
	});
	expect(
		http.calls.find(({ url }) => url === remote.target.url('a/same.md'))?.headers?.[
			'X-OC-Mtime'
		],
	).toBe('1000');
	expect(
		http.calls.find(({ url }) => url === remote.target.url('b/same.md'))?.headers?.[
			'X-OC-Mtime'
		],
	).toBe('2000');
	release.resolve();
	await Promise.all([first, second]);
	expect(remote.session.uploading.size).toBe(0);
	const failed = await createRemote(testKit.request(() => ({ status: 500 })).request);
	expect(
		await Promise.resolve(failed.fs.write('a/same.md', testKit.bytes('a'), firstStat)).catch(
			(error: unknown) => error,
		),
	).toMatchObject({ status: 500 });
	expect(failed.session.uploading.size).toBe(0);
});

test('WebDAV uploads without native times do not invent headers from FileStat.mtime', async () => {
	const http = testKit.request(() => ({ headers: { etag: 'uploaded' } }));
	const remote = await createRemote(http.request);
	await remote.fs.write(
		'generated',
		testKit.bytes('body'),
		testKit.file('generated', { mtime: 1_700_000_123_456 }),
	);
	expect(http.calls[0].headers).not.toHaveProperty('X-OC-Mtime');
	expect(http.calls[0].headers).not.toHaveProperty('X-OC-Ctime');
	expect(remote.session.uploading.size).toBe(0);
});

test('WebDAV mkdir preserves native folder metadata and recursive options', async () => {
	const http = testKit.request(() => ({}));
	const remote = await createRemote(http.request, false, true);
	const stat = {
		...testKit.folder('nested/child/'),
		meta: () => Promise.resolve({ custom: 'folder' }),
	};
	await remote.fs.mkdir('nested/child/', stat, true);
	expect(http.calls.filter(({ method }) => method === 'MKCOL').map(({ url }) => url)).toEqual([
		remote.target.url('nested/'),
		remote.target.url('nested/child/'),
	]);
	expect(http.calls.find(({ method }) => method === 'PROPPATCH')).toMatchObject({
		url: remote.target.url('nested/child/'),
	});
	expect(http.calls.at(-1)?.body).toContain('"custom":"folder"');
});
