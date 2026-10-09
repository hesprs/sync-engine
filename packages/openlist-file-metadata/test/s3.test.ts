import type { Fs } from '@hesprs/sync-engine-sdk';
import { testKit } from '@hesprs/sync-engine-sdk/dev';
import { expect, test } from 'bun:test';
import { RemoteSession, remoteMiddleware } from '../src/remote';
import { createRemote, decide, object, target, xml } from './s3-harness';
import createVault from './vault';

test('OpenList multipart responses retain their upload ID', async () => {
	const http = testKit.request(() => ({
		text: () => '<InitiateMultipartUpload><UploadId>42</UploadId></InitiateMultipartUpload>',
	}));
	const send = remoteMiddleware(http.request, new RemoteSession(target, () => true));
	expect((await send(target.url('large'), { method: 'POST' })).text()).toContain(
		'<InitiateMultipartUpload>',
	);
	expect((await send(`${target.url('large')}?uploads=`, { method: 'POST' })).text()).toBe(
		'<InitiateMultipartUploadResult><UploadId>42</UploadId></InitiateMultipartUploadResult>',
	);
});

test.each(['', '""', 'valid-etag'])(
	'listings retain standard dates and use the supplied ETag when valid (%s)',
	async (etag) => {
		const modified = '2026-10-04T11:00:00.080Z';
		const http = testKit.request(() => ({
			text: () => xml(object('todo.md', { etag, mtime: modified })),
		}));
		const remote = await createRemote(http.request);
		const [stat] = await remote.fs.list('/', () => 'advance');
		expect(stat).toMatchObject({
			mtime: Date.parse(modified),
			uid: etag === 'valid-etag' ? etag : `${Date.parse(modified)}~22`,
		});
		expect(http.calls).toHaveLength(1);
		expect(http.calls[0].method).toBe('GET');
	},
);

test.each(['transient', '""', undefined])(
	'uploads record the listed identity and need no HEAD even without a PUT ETag (%s)',
	async (etag) => {
		const key = 'todo.md';
		const body = testKit.bytes('body');
		const localMtime = Date.parse('2026-10-04T10:00:00.150Z');
		const modified = '2026-10-04T11:00:00.080Z';
		const uid = `${Date.parse(modified)}~${body.length}`;
		const headers: Record<string, string> = etag === undefined ? {} : { ETag: etag };
		const http = testKit.request((_url, params) =>
			params.method === 'PUT'
				? { headers }
				: { text: () => xml(object(key, { mtime: modified, size: body.length })) },
		);
		const remote = await createRemote(http.request);
		const local = testKit.file(key, {
			meta: () => ({ mtime: String(localMtime) }),
			mtime: localMtime,
			size: body.length,
		});
		expect(await remote.fs.write(key, body, local)).toBe(uid);
		expect(http.calls.map(({ method }) => method)).toEqual(['PUT', 'GET']);
		expect(http.calls[0].headers?.['X-Amz-Meta-Mtime']).toBe(String(localMtime / 1000));
		expect(new URL(http.calls[1].url).searchParams.get('prefix')).toBe(key);
		expect(remote.session.uploading.size).toBe(0);
		expect(remote.session.uploadedStats.size).toBe(0);
		const stats = await remote.fs.list('/', () => 'advance');
		expect(
			await decide(
				[local],
				stats,
				new Map([[key, { isDir: false, local: local.uid, remote: uid }]]),
			),
		).toEqual([]);
	},
);

test('file lookups match the exact key across pages and missing files report 404', async () => {
	const http = testKit.request((url) => ({
		text: () =>
			new URL(url).searchParams.has('continuation-token')
				? xml(object('todo.md', { size: 0 }))
				: xml(
						object('todo.md.backup'),
						'<IsTruncated>true</IsTruncated><NextContinuationToken>next</NextContinuationToken>',
					),
	}));
	const remote = await createRemote(http.request);
	expect(await remote.fs.stat('todo.md')).toMatchObject({ key: 'todo.md', size: 0 });
	expect(http.calls).toHaveLength(2);
	const missing = await createRemote(testKit.request(() => ({ text: () => xml('') })).request);
	expect(await missing.fs.exists('missing.md')).toBe(false);
});

test('multipart uploads keep their time header and record the listed identity without HEAD', async () => {
	const key = 'large.bin';
	const size = 6 * 1024 * 1024 + 1;
	const mtime = Date.parse('2026-10-04T10:00:00.150Z');
	const modified = '2026-10-04T11:00:00.080Z';
	const http = testKit.request((url, params) => {
		const query = new URL(url).searchParams;
		if (query.has('uploads'))
			return {
				text: () =>
					'<InitiateMultipartUpload><UploadId>42</UploadId></InitiateMultipartUpload>',
			};
		if (params.method === 'PUT') return { headers: { ETag: 'part' } };
		if (query.has('uploadId'))
			return {
				text: () =>
					'<CompleteMultipartUploadResult><ETag>transient</ETag></CompleteMultipartUploadResult>',
			};
		return { text: () => xml(object(key, { mtime: modified, size })) };
	});
	const remote = await createRemote(http.request);
	const source = testKit.file(key, { meta: () => ({ mtime: String(mtime) }), mtime, size });
	expect(await remote.fs.writeStream(key, testKit.stream([new Uint8Array(size)]), source)).toBe(
		`${Date.parse(modified)}~${size}`,
	);
	expect(http.calls.map(({ method }) => method)).toEqual(['POST', 'PUT', 'PUT', 'POST', 'GET']);
	expect(http.calls.map(({ headers }) => headers?.['X-Amz-Meta-Mtime'])).toEqual([
		String(mtime / 1000),
		undefined,
		undefined,
		undefined,
		undefined,
	]);
	expect(remote.session.uploading.size).toBe(0);
	expect(remote.session.uploadedStats.size).toBe(0);
});

test.each([false, true])(
	'file metadata stays lazy and follows fetchObjectMeta=%s for list and stat',
	async (fetchObjectMeta) => {
		const modified = '2026-10-04T11:00:00.080Z';
		const ctime = '1500000000000';
		const http = testKit.request((_url, params) =>
			params.method === 'HEAD'
				? {
						headers: {
							'X-Amz-Meta-Ctime': ctime,
							'x-amz-meta-custom': 'retained',
							'x-amz-meta-mtime': '123',
						},
					}
				: { text: () => xml(object('a.md', { mtime: modified })) },
		);
		const remote = await createRemote(http.request, '', fetchObjectMeta);
		const [listed] = await remote.fs.list('/', () => 'advance');
		const stat = await remote.fs.stat('a.md');
		expect(http.calls.map(({ method }) => method)).toEqual(['GET', 'GET']);
		for (const item of [listed, stat]) {
			const results = await Promise.all([item.meta(), item.meta()]);
			expect(results[0]).toEqual(
				fetchObjectMeta
					? { ctime, custom: 'retained', mtime: String(Date.parse(modified)) }
					: { mtime: String(Date.parse(modified)) },
			);
			expect(results[1]).toEqual(results[0]);
		}
		expect(http.calls.filter(({ method }) => method === 'HEAD')).toHaveLength(
			fetchObjectMeta ? 2 : 0,
		);
	},
);

test('an optional metadata lookup failure rejects consumption without breaking discovery', async () => {
	const http = testKit.request((_url, params) =>
		params.method === 'HEAD' ? { status: 403 } : { text: () => xml(object('a.md')) },
	);
	const remote = await createRemote(http.request, '', true);
	const stat = await remote.fs.stat('a.md');
	expect(http.calls).toHaveLength(1);
	for (let i = 0; i < 2; i++)
		expect(await Promise.resolve(stat.meta()).catch((error: unknown) => error)).toMatchObject({
			status: 403,
		});
	expect(http.calls).toHaveLength(2);
});

test('streamed downloads restore native S3 creation metadata with one lazy HEAD', async () => {
	const modified = '2026-10-04T11:00:00.080Z';
	const ctime = 1_500_000_000_000;
	const body = testKit.bytes('body');
	const http = testKit.request((url, params) => {
		if (new URL(url).searchParams.has('list-type'))
			return { text: () => xml(object('a.md', { mtime: modified, size: body.length })) };
		if (params.method === 'HEAD')
			return { headers: { 'x-amz-meta-ctime': String(ctime), 'x-amz-meta-mtime': 'stale' } };
		return { bytes: () => body };
	});
	const remote = await createRemote(http.request, '', true);
	const [stat] = await remote.fs.list('/', () => 'advance');
	if (stat.isDir) throw new Error('Expected file');
	const vault = await createVault();
	expect(await vault.fs.writeStream('a.md', await remote.fs.readStream('a.md', stat), stat)).toBe(
		`${Date.parse(modified)}~4`,
	);
	expect(vault.files.get('a.md')).toEqual({ ctime, mtime: Date.parse(modified), value: body });
	expect(http.calls.filter(({ method }) => method === 'HEAD')).toHaveLength(1);
});

test('S3 mkdir forwards folder metadata and recursive options through the wrapper', async () => {
	const http = testKit.request(() => ({}));
	const remote = await createRemote(http.request, 'prefix/');
	const stat = {
		...testKit.folder('nested/child/'),
		meta: () =>
			Promise.resolve({ ctime: '1500000000000', custom: 'folder', mtime: '1700000123456' }),
	};
	await remote.fs.mkdir('nested/child/', stat, true);
	expect(http.calls.map(({ url }) => url).sort()).toEqual([
		'https://s3.example/vault/prefix/',
		'https://s3.example/vault/prefix/nested/',
		'https://s3.example/vault/prefix/nested/child/',
	]);
	expect(http.calls.find(({ url }) => url.endsWith('/child/'))?.headers).toMatchObject({
		'x-amz-meta-ctime': '1500000000000',
		'x-amz-meta-custom': 'folder',
		'x-amz-meta-mtime': '1700000123456',
	});
	expect(
		http.calls.filter(({ headers }) => headers?.['X-Amz-Meta-Mtime'] !== undefined),
	).toHaveLength(0);
});

test('same-object S3 writes reject concurrency and metadata failures release UID state', async () => {
	const started = testKit.deferred<void>();
	const release = testKit.deferred<void>();
	const http = testKit.request(async (_url, params) => {
		if (params.method === 'PUT') {
			started.resolve();
			await release.promise;
			return { headers: { etag: 'uploaded' } };
		}
		return { text: () => xml(object('a.md')) };
	});
	const remote = await createRemote(http.request);
	const stat = testKit.file('a.md');
	const first = remote.fs.write('a.md', testKit.bytes('a'), stat);
	await started.promise;
	expect(
		await Promise.resolve(remote.fs.write('a.md', testKit.bytes('b'), stat)).catch(
			(error: unknown) => error,
		),
	).toMatchObject({ message: `Concurrent writes to the same file: ${target.url('a.md')}` });
	release.resolve();
	await first;
	const failed = {
		...stat,
		meta: () => Promise.reject(new Error('metadata failed')),
	};
	expect(
		await Promise.resolve(remote.fs.write('a.md', testKit.bytes('a'), failed)).catch(
			(error: unknown) => error,
		),
	).toMatchObject({ message: 'metadata failed' });
	expect(remote.session.activeS3Writes.size).toBe(0);
	expect(remote.session.uploadedStats.size).toBe(0);
	expect(remote.session.uploading.size).toBe(0);
});

test.each(['buffered', 'streamed'])(
	'download GET supplies ctime and custom metadata without HEAD (%s)',
	async (mode) => {
		const ctime = 1_500_000_000_000;
		const mtime = Date.parse('2026-10-04T11:00:00.080Z');
		const body = testKit.bytes('body');
		const http = testKit.request((url) =>
			new URL(url).searchParams.has('list-type')
				? { text: () => xml(object('a.md', { size: body.length })) }
				: {
						bytes: () => body,
						headers: {
							'Last-Modified': 'Sun, 04 Oct 2026 10:00:00 GMT',
							'X-Amz-Meta-Ctime': String(ctime),
							'X-Amz-Meta-Custom': 'retained',
							'X-Amz-Meta-Mtime': '123.456',
						},
					},
		);
		const remote = await createRemote(http.request);
		const [stat] = await remote.fs.list('/', () => 'advance');
		if (stat.isDir) throw new Error('Expected file');
		// Metadata consumed before download must not hide later GET metadata.
		expect(await stat.meta()).toEqual({ mtime: String(mtime) });
		const vault = await createVault();
		await (mode === 'streamed'
			? vault.fs.writeStream('a.md', await remote.fs.readStream('a.md', stat), stat)
			: vault.fs.write('a.md', await remote.fs.read('a.md', stat), stat));
		expect(vault.files.get('a.md')).toEqual({ ctime, mtime, value: body });
		expect(await stat.meta()).toEqual({
			ctime: String(ctime),
			custom: 'retained',
			mtime: String(mtime),
		});
		expect(http.calls.map(({ method }) => method)).toEqual(['GET', 'GET']);
		remote.session.clear();
		expect(remote.session.downloadedMeta.size).toBe(0);
	},
);

test('ending a session restores the backend stat method', async () => {
	const http = testKit.request(() => ({ text: () => xml(object('a.md')) }));
	const remote = await createRemote(http.request);
	const source = new URL('../../s3/src/s3/fs.ts', import.meta.url).href;
	const { default: S3Fs } = (await import(source)) as { default: { prototype: Fs } };
	expect(remote.raw.stat).not.toBe(S3Fs.prototype.stat);
	remote.session.clear();
	expect(remote.raw.stat).toBe(S3Fs.prototype.stat);
});

test('a cached stat receives metadata from the next sync session download', async () => {
	const ctime = '1500000000000';
	const http = testKit.request((url) =>
		new URL(url).searchParams.has('list-type')
			? { text: () => xml(object('a.md', { size: 4 })) }
			: { bytes: () => testKit.bytes('body'), headers: { 'x-amz-meta-ctime': ctime } },
	);
	const first = await createRemote(http.request);
	const [stat] = await first.fs.list('/', () => 'advance');
	if (stat.isDir) throw new Error('Expected file');
	first.session.clear();
	const next = await createRemote(http.request);
	await next.fs.read('a.md', stat);
	expect((await stat.meta()).ctime).toBe(ctime);
	expect(next.session.downloadedMeta.size).toBe(1);
	expect(first.session.downloadedMeta.size).toBe(0);
});
