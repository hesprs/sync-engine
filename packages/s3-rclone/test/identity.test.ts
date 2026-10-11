import { testKit } from '@hesprs/sync-engine-sdk/dev';
import { expect, test } from 'bun:test';
import { createRemote, decide, object, xml } from './s3-harness';

const modified = '2026-10-04T11:00:00.987Z';
const mtime = Date.parse(modified);
const second = Math.floor(mtime / 1000) * 1000;
const key = '中文 & space/note #%.md';

function queriedHeaders(size: number, etag?: string) {
	return {
		'Content-Length': String(size),
		'Last-Modified': new Date(mtime).toUTCString(),
		'x-amz-meta-mtime': '1700000123.456',
		...(etag === undefined ? {} : { ETag: etag }),
	};
}

const cases = [false, true].flatMap((fastMode) => [
	{ fastMode, queriedEtag: '"confirmed"', uploadEtag: 'transient' },
	{ fastMode, queriedEtag: '""', uploadEtag: '""' },
	{ fastMode, queriedEtag: undefined, uploadEtag: undefined },
]);

test.each(cases)(
	'PUT confirms identity (fast: $fastMode, response: $uploadEtag, queried: $queriedEtag)',
	async ({ fastMode, queriedEtag, uploadEtag }) => {
		const body = testKit.bytes('body');
		const http = testKit.request((_url, params) => {
			if (params.method === 'PUT') {
				const headers: Record<string, string> =
					uploadEtag === undefined ? {} : { ETag: uploadEtag };
				return { headers };
			}
			if (params.method === 'HEAD')
				return { headers: queriedHeaders(body.length, queriedEtag) };
			let contents = object(key, { etag: queriedEtag, mtime: modified, size: body.length });
			if (queriedEtag === undefined) contents = contents.replace('<ETag></ETag>', '');
			return { text: () => xml(contents) };
		});
		let fast = fastMode;
		const remote = await createRemote(http.request, '', false, { fastMode: () => fast });
		const source = testKit.file(key, {
			meta: () => ({ mtime: '1700000123456' }),
			size: body.length,
		});
		const uid = await remote.fs.write(key, body, source);
		expect(uid).toBe(queriedEtag === '"confirmed"' ? 'confirmed' : `${second}~${body.length}`);
		// A fallback inside S3Fs is reused, so each upload makes one confirmation.
		expect(http.calls.map(({ method }) => method)).toEqual(['PUT', fastMode ? 'HEAD' : 'GET']);
		expect(http.calls[0].headers?.['X-Amz-Meta-Mtime']).toBe('1700000123.456');
		if (!fastMode) expect(new URL(http.calls[1].url).searchParams.get('prefix')).toBe(key);
		for (const mode of [fastMode, !fastMode]) {
			fast = mode;
			const stat = await remote.fs.stat(key);
			expect(stat).toMatchObject({ mtime: mode ? second : mtime, uid });
			const listed = await remote.fs.list('/', () => 'advance');
			expect(listed.find((entry) => entry.key === key)).toMatchObject({ mtime, uid });
			const local = [source, testKit.folder('中文 & space/')];
			expect(
				await decide(
					local,
					listed,
					new Map([
						[key, { isDir: false, local: source.uid, remote: uid }],
						['中文 & space/', { isDir: true }],
					]),
				),
			).toEqual([]);
		}
		expect(remote.session.uploads.size).toBe(0);
	},
);

test.each([
	{ etag: 'transient', fastMode: false },
	{ etag: 'transient', fastMode: true },
	{ etag: undefined, fastMode: false },
	{ etag: '""', fastMode: true },
])(
	'multipart confirms identity once (fast: $fastMode, response: $etag)',
	async ({ fastMode, etag }) => {
		const size = 6 * 1024 * 1024;
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
						`<CompleteMultipartUploadResult>${etag === undefined ? '' : `<ETag>${etag}</ETag>`}</CompleteMultipartUploadResult>`,
				};
			if (params.method === 'HEAD') return { headers: queriedHeaders(size) };
			return { text: () => xml(object(key, { mtime: modified, size })) };
		});
		const remote = await createRemote(http.request, '', false, { fastMode: () => fastMode });
		const uid = await remote.fs.writeStream(
			key,
			testKit.stream([new Uint8Array(size)]),
			testKit.file(key, {
				meta: () => ({ mtime: '1700000123456' }),
				size,
			}),
		);
		expect(uid).toBe(`${second}~${size}`);
		expect(http.calls.map(({ method }) => method)).toEqual([
			'POST',
			'PUT',
			'PUT',
			'POST',
			fastMode ? 'HEAD' : 'GET',
		]);
		expect(http.calls.map(({ headers }) => headers?.['X-Amz-Meta-Mtime'])).toEqual([
			'1700000123.456',
			undefined,
			undefined,
			undefined,
			undefined,
		]);
	},
);

test('fast stat reuses HEAD metadata without an additional lookup', async () => {
	const http = testKit.request(() => ({ headers: queriedHeaders(0) }));
	const remote = await createRemote(http.request, '', true, {
		fastMode: () => true,
		preferMetadataMtime: true,
	});
	const stat = await remote.fs.stat(key);
	expect(await stat.meta()).toEqual({ mtime: '1700000123456' });
	expect(await stat.meta()).toEqual({ mtime: '1700000123456' });
	expect(stat).toMatchObject({ mtime: second, size: 0, uid: `${second}~0` });
	expect(http.calls.map(({ method }) => method)).toEqual(['HEAD']);
});

test.each([403, 404])('fast HEAD propagates HTTP %s', async (status) => {
	const http = testKit.request(() => ({ status }));
	const remote = await createRemote(http.request, '', false, { fastMode: () => true });
	expect(remote.fs.stat(key)).rejects.toMatchObject({ status });
	expect(http.calls.map(({ method }) => method)).toEqual(['HEAD']);
});

test.each([
	{ 'Content-Length': '1' },
	{ 'Content-Length': '1', 'Last-Modified': 'invalid' },
	{ 'Content-Length': '-1', 'Last-Modified': new Date(mtime).toUTCString() },
	{ 'Content-Length': '1x', 'Last-Modified': new Date(mtime).toUTCString() },
] as Array<Record<string, string>>)('invalid HEAD metadata rejects discovery', async (headers) => {
	const http = testKit.request(() => ({ headers }));
	const remote = await createRemote(http.request, '', false, { fastMode: () => true });
	expect(remote.fs.stat(key)).rejects.toThrow('Invalid S3 rclone file metadata');
});
