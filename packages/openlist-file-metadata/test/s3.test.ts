import { testKit } from '@hesprs/sync-engine-sdk/dev';
import { expect, test } from 'bun:test';
import { RemoteSession, remoteMiddleware } from '../src/remote';
import { attachTimes, getTimes } from '../src/times';
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

test.each(['buffered', 'streamed'])(
	'equal-size remote edits download the listed time and preserve local ctime (%s)',
	async (mode) => {
		const key = 'todo.md';
		const oldMtime = Date.parse('2026-10-04T10:00:00Z');
		const newMtime = Date.parse('2026-10-04T11:00:00.080Z');
		const ctime = Date.parse('2026-10-01T09:00:00Z');
		const body = testKit.bytes('- [x] 1400\n');
		const http = testKit.request((url) =>
			new URL(url).searchParams.has('list-type')
				? {
						text: () =>
							xml(
								object(key, {
									mtime: new Date(newMtime).toISOString(),
									size: body.length,
								}),
							),
					}
				: {
						bytes: () => body,
						headers: {
							'Last-Modified': new Date(oldMtime).toUTCString(),
							'X-Amz-Meta-Mtime': String(oldMtime / 1000),
						},
					},
		);
		const remote = await createRemote(http.request);
		const vault = await createVault();
		vault.files.set(key, { ctime, mtime: oldMtime, value: testKit.bytes('- [x] Todo\n') });
		const local = await vault.fs.stat(key);
		if (local.isDir) throw new Error('Expected file');
		const [stat] = await remote.fs.list('/', () => 'advance');
		if (stat.isDir) throw new Error('Expected file');
		expect(
			(
				await decide(
					[local],
					[stat],
					new Map([
						[
							key,
							{
								isDir: false,
								local: local.uid,
								remote: `${oldMtime}~${body.length}`,
							},
						],
					]),
				)
			).map(({ key: taskKey, name }) => ({ key: taskKey, name })),
		).toEqual([{ key, name: 'download' }]);
		await (mode === 'streamed'
			? vault.fs.writeStream(key, await remote.fs.readStream(key, stat), stat)
			: vault.fs.write(key, await remote.fs.read(key, stat), stat));
		expect(vault.files.get(key)).toEqual({ ctime, mtime: newMtime, value: body });
		expect(getTimes(stat)).toEqual({ ctime: undefined, mtime: newMtime });
		expect(http.calls).toHaveLength(2);
		expect(http.calls.every(({ method }) => method === 'GET')).toBe(true);
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
		const local = attachTimes(testKit.file(key, { mtime: localMtime, size: body.length }), {
			mtime: localMtime,
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
	const source = attachTimes(testKit.file(key, { mtime, size }), { mtime });
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
