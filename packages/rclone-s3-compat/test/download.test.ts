import { chunkSize, pipe } from '@hesprs/sync-engine-sdk';
import { testKit } from '@hesprs/sync-engine-sdk/dev';
import { expect, mock, test } from 'bun:test';
import RcloneFs from '@/remote';
import S3Fs from '../../s3/src/s3/fs';

const MS = 1_700_000_123_456;
let size = 4;
void mock.module('@repo/shared/parse-xml', () => ({
	default: () => ({
		ListBucketResult: {
			Contents: {
				ETag: '"etag"',
				Key: 'note.md',
				LastModified: new Date(MS).toISOString(),
				Size: String(size),
			},
		},
	}),
}));

for (const streaming of [false, true])
	test.each([undefined, '1700000123', '1600000000', 'head', 'changed-first', 'changed-later'])(
		`LIST → ${streaming ? 'ranged GET' : 'GET'} → local write → LIST: %s`,
		async (mtime) => {
			size = streaming ? chunkSize * 2 + 1 : 4;
			let gets = 0;
			const remote = testKit.request((url, params) => {
				if (url.includes('list-type')) return {};
				if (params.method === 'HEAD') {
					expect(mtime).toBe('head');
					return { headers: { 'x-amz-meta-mtime': '1700000123' } };
				}
				expect(params.method).toBe('GET');
				gets++;
				const range = params.headers?.Range?.match(/\d+/gu)?.map(Number);
				const changed =
					mtime === 'changed-first' || (mtime === 'changed-later' && gets > 1);
				return {
					bytes: () => new Uint8Array(range ? range[1] - range[0] + 1 : size),
					headers: {
						ETag: changed ? '"new-etag"' : '"etag"',
						'x-amz-meta-ctime': '42',
						...(mtime?.startsWith('changed') || mtime === undefined || mtime === 'head'
							? {}
							: { 'x-amz-meta-mtime': mtime }),
					},
				};
			});
			const fs = new RcloneFs(
				new S3Fs({
					accessKeyId: 'test',
					bucket: 'vault',
					endpoint: 'https://s3.example.com',
					region: 'us-east-1',
					request: remote.request,
					urlStyle: 'path',
				}),
				false,
			);
			const local = testKit.fs({
				control: {
					write: async (_key, value, stat) => {
						expect(value.byteLength).toBe(size);
						expect(await stat.meta()).toEqual({ ctime: '42', mtime: String(MS) });
						return `${(await stat.meta()).mtime}~${value.byteLength}`;
					},
					writeStream: async (key, value, stat) =>
						local.control.write(key, await new Response(value).bytes(), stat),
				},
			});
			const [stat] = await fs.list('/', () => 'include');
			if (stat.isDir) throw new Error('Expected a file');
			expect(stat.uid).toBe('etag');
			if (mtime === 'head') expect(await stat.meta()).toEqual({ mtime: String(MS) });
			const download = pipe({ from: fs, key: stat.key, stat, to: local.fs });
			if (mtime === 'changed-first' || (streaming && mtime === 'changed-later')) {
				expect(await download.catch((error: unknown) => error)).toMatchObject({
					message: 'S3 object changed during download: note.md',
				});
				expect(local.calls.write).toHaveLength(0);
			} else {
				expect(await download).toBe(`${MS}~${size}`);
				const [next] = await fs.list('/', () => 'include');
				expect(next).toMatchObject({ mtime: MS, uid: stat.uid });
			}
			expect(remote.calls.filter((call) => call.method === 'HEAD')).toHaveLength(
				mtime === 'head' ? 1 : 0,
			);
		},
	);
