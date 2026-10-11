import type { Fs, Stat } from '@hesprs/sync-engine-sdk';
import { testKit } from '@hesprs/sync-engine-sdk/dev';
import { expect, test } from 'bun:test';
import { createRemote, object, target, xml } from './s3-harness';
import createVault from './vault';

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

test('S3 mkdir skips directory marker uploads through the wrapper', async () => {
	const http = testKit.request(() => ({}));
	const remote = await createRemote(http.request, 'prefix/');
	const stat = {
		...testKit.folder('nested/child/'),
		meta: () => {
			throw new Error('Skipped directories must not consume upload metadata.');
		},
	};
	await remote.fs.mkdir('nested/child/', stat, true);
	expect(http.calls).toHaveLength(0);
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
	expect(remote.session.uploads.size).toBe(0);
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

test('asymmetric directory files remain ordinary uploads', async () => {
	const source = new URL('../../plugin/src/fs/wrappers/asymmetric-storage.ts', import.meta.url)
		.href;
	const { default: asymmetricStorageWrapper } = (await import(source)) as {
		default: (
			original: Fs,
			store: { values: () => Array<Stat> },
			logger: (message: string) => void,
		) => Fs;
	};
	const keys: Array<string> = [];
	const http = testKit.request((url, params) => {
		if (params.method === 'PUT') {
			keys.push(decodeURIComponent(new URL(url).pathname.slice('/vault/'.length)));
			return { headers: { ETag: 'transient' } };
		}
		return { text: () => xml(keys.map((key) => object(key, { size: 0 })).join('')) };
	});
	const remote = await createRemote(http.request);
	const asymmetric = asymmetricStorageWrapper(remote.fs, { values: () => [] }, () => {});
	await asymmetric.mkdir('folder/', testKit.folder('folder/'));
	expect(keys).toHaveLength(1);
	expect(keys[0]).toStartWith('00000');
	expect(keys[0]).toEndWith('~folder');
	expect(keys[0]).not.toContain('/');
	expect(await asymmetric.list('/', () => 'advance')).toMatchObject([
		{ isDir: true, key: 'folder/' },
	]);
});

test('multipart cancellation aborts the upload and releases time and identity state', async () => {
	const aborted = testKit.deferred<void>();
	const cancelled = new Error('cancelled');
	const http = testKit.request((url, params) => {
		const query = new URL(url).searchParams;
		if (query.has('uploads'))
			return {
				text: () =>
					'<InitiateMultipartUploadResult><UploadId>42</UploadId></InitiateMultipartUploadResult>',
			};
		if (params.method === 'DELETE') {
			aborted.resolve();
			return {};
		}
		throw cancelled;
	});
	const remote = await createRemote(http.request);
	const size = 6 * 1024 * 1024;
	const result = await Promise.resolve(
		remote.fs.writeStream(
			'large.bin',
			testKit.stream([new Uint8Array(size)]),
			testKit.file('large.bin', { meta: () => ({ mtime: '1700000123456' }), size }),
		),
	).catch((error: unknown) => error);
	expect(result).toBe(cancelled);
	await aborted.promise;
	expect(http.calls.at(-1)).toMatchObject({ ignoreCancellation: true, method: 'DELETE' });
	expect(http.calls.some(({ method }) => method === 'HEAD' || method === 'GET')).toBe(false);
	expect(remote.session.uploads.size).toBe(0);
});

test.each(['', 'invalid', '9000000000000000'])(
	'invalid upload metadata mtime is omitted (%s)',
	async (mtime) => {
		const http = testKit.request((_url, params) =>
			params.method === 'PUT'
				? { headers: { ETag: 'transient' } }
				: { text: () => xml(object('a.md')) },
		);
		const remote = await createRemote(http.request);
		await remote.fs.write(
			'a.md',
			testKit.bytes('a'),
			testKit.file('a.md', { meta: () => ({ mtime }), mtime: 123_456 }),
		);
		expect(http.calls[0].headers).not.toHaveProperty('X-Amz-Meta-Mtime');
		expect(http.calls[0].headers).not.toHaveProperty('x-amz-meta-mtime');
	},
);

test.each([false, true])(
	'pending confirmation keeps each upload isolated (other confirmation fails: %s)',
	async (failOther) => {
		const confirming = testKit.deferred<void>();
		const release = testKit.deferred<void>();
		const http = testKit.request(async (url, params) => {
			if (params.method === 'PUT') return { headers: { ETag: 'transient' } };
			const key = new URL(url).searchParams.get('prefix');
			if (key === 'a.md') {
				confirming.resolve();
				await release.promise;
			}
			if (key === 'b.md' && failOther) return { status: 403 };
			if (!key) throw new Error('Expected exact lookup');
			return { text: () => xml(object(key, { etag: `stored-${key}` })) };
		});
		const remote = await createRemote(http.request);
		const source = (key: string, mtime: number) =>
			testKit.file(key, { meta: () => ({ mtime: String(mtime) }) });
		const first = remote.fs.write(
			'a.md',
			testKit.bytes('a'),
			source('a.md', 1_700_000_123_456),
		);
		await confirming.promise;
		const duplicate = await Promise.resolve(
			remote.fs.write('a.md', testKit.bytes('duplicate'), source('a.md', 1)),
		).catch((error: unknown) => error);
		expect(duplicate).toMatchObject({
			message: `Concurrent writes to the same file: ${target.url('a.md')}`,
		});
		const second = await Promise.resolve(
			remote.fs.write('b.md', testKit.bytes('b'), source('b.md', 1_800_000_123_789)),
		).catch((error: unknown) => error);
		expect(second).toEqual(
			failOther ? expect.objectContaining({ status: 403 }) : 'stored-b.md',
		);
		expect(
			http.calls
				.filter(({ method }) => method === 'PUT')
				.map(({ headers }) => headers?.['X-Amz-Meta-Mtime']),
		).toEqual(['1700000123.456', '1800000123.789']);
		expect(remote.session.uploads.size).toBe(1);
		release.resolve();
		expect(await first).toBe('stored-a.md');
		expect(remote.session.uploads.size).toBe(0);
	},
);

test.each([
	{ failedLookup: false, streamed: false },
	{ failedLookup: false, streamed: true },
	{ failedLookup: true, streamed: false },
])(
	'cached stats use current-session metadata after cancellation (cached failure: $failedLookup, streamed: $streamed)',
	async ({ failedLookup, streamed }) => {
		let cancelled = false;
		const oldHttp = testKit.request((_url, params) => {
			if (cancelled) throw new Error('Previous sync cancelled');
			return params.method === 'HEAD'
				? { status: 403 }
				: { text: () => xml(object('a.md', { size: 4 })) };
		});
		const first = await createRemote(oldHttp.request, '', true, true);
		const [stat] = await first.fs.list('/', () => 'advance');
		if (stat.isDir) throw new Error('Expected file');
		if (failedLookup)
			expect(
				await Promise.resolve(stat.meta()).catch((error: unknown) => error),
			).toMatchObject({ status: 403 });
		first.session.clear();
		cancelled = true;
		const freshMeta = {
			'x-amz-meta-ctime': '1500000000000',
			'x-amz-meta-custom': 'fresh',
			'x-amz-meta-mtime': '1700000123.456',
		};
		const http = testKit.request((_url, params) =>
			params.method === 'HEAD'
				? { headers: freshMeta }
				: { bytes: () => testKit.bytes('body') },
		);
		const next = await createRemote(http.request, '', true, true);
		const vault = await createVault();
		await (streamed
			? vault.fs.writeStream('a.md', await next.fs.readStream('a.md', stat), stat)
			: vault.fs.write('a.md', await next.fs.read('a.md', stat), stat));
		expect(vault.files.get('a.md')).toEqual({
			ctime: 1_500_000_000_000,
			mtime: 1_700_000_123_456,
			value: testKit.bytes('body'),
		});
		for (let i = 0; i < 2; i++)
			expect(await stat.meta()).toEqual({
				ctime: '1500000000000',
				custom: 'fresh',
				mtime: '1700000123456',
			});
		expect(oldHttp.calls.map(({ method }) => method)).toEqual(
			failedLookup ? ['GET', 'HEAD'] : ['GET'],
		);
		expect(http.calls.map(({ method }) => method)).toEqual(['GET', 'HEAD']);
	},
);

test.each([false, true])(
	'current-session lazy HEAD failures stay cached (fetch metadata: %s)',
	async (fetchObjectMeta) => {
		const oldHttp = testKit.request(() => ({ text: () => xml(object('a.md', { size: 4 })) }));
		const first = await createRemote(oldHttp.request, '', true);
		const [stat] = await first.fs.list('/', () => 'advance');
		if (stat.isDir) throw new Error('Expected file');
		first.session.clear();
		const http = testKit.request((_url, params) =>
			params.method === 'HEAD' ? { status: 403 } : { bytes: () => testKit.bytes('body') },
		);
		const next = await createRemote(http.request, '', fetchObjectMeta);
		await next.fs.read('a.md', stat);
		for (let i = 0; i < 2; i++) {
			const result = await Promise.resolve(stat.meta()).catch((error: unknown) => error);
			expect(result).toMatchObject(
				fetchObjectMeta ? { status: 403 } : { mtime: String(stat.mtime) },
			);
		}
		expect(oldHttp.calls.map(({ method }) => method)).toEqual(['GET']);
		expect(http.calls.map(({ method }) => method)).toEqual(
			fetchObjectMeta ? ['GET', 'HEAD'] : ['GET'],
		);
	},
);

test('a moved cached stat fetches metadata for its new key', async () => {
	const http = testKit.request((url, params) => {
		const parsed = new URL(url);
		if (parsed.searchParams.has('list-type'))
			return { text: () => xml(object('a.md', { size: 4 })) };
		if (params.method === 'HEAD')
			return parsed.pathname.endsWith('/b.md')
				? { headers: { 'x-amz-meta-ctime': '1500000000000' } }
				: { status: 404 };
		return { bytes: () => testKit.bytes('body') };
	});
	const remote = await createRemote(http.request, '', true);
	const [stat] = await remote.fs.list('/', () => 'advance');
	if (stat.isDir) throw new Error('Expected file');
	await remote.fs.move('a.md', 'b.md');
	// ContextFs preserves symbol fields when it moves a cached stat.
	const moved = { ...stat, key: 'b.md' };
	expect(await remote.fs.read('b.md', moved)).toEqual(testKit.bytes('body'));
	expect(await moved.meta()).toEqual({ ctime: '1500000000000', mtime: String(stat.mtime) });
	expect(http.calls.filter(({ method }) => method === 'HEAD').map(({ url }) => url)).toEqual([
		target.url('b.md'),
	]);
});
