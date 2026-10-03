import { testKit } from '@hesprs/sync-engine-sdk/dev';
import { expect, test } from 'bun:test';
import { RemoteSession, remoteMiddleware } from '../src/remote';
import { getTarget } from '../src/target';

const target = getTarget({
	modules: { s3: { bucket: 'vault', endpoint: 'https://s3.example', urlStyle: 'path' } },
	remoteFs: 's3',
});
if (!target) throw new Error('Missing target');

test('OpenList nonstandard multipart root is normalized without changing upload ID', async () => {
	const http = testKit.request(() => ({
		text: () => '<InitiateMultipartUpload><UploadId>42</UploadId></InitiateMultipartUpload>',
	}));
	const send = remoteMiddleware(http.request, new RemoteSession(target, () => true));
	const result = await send(target.url('large'), { method: 'POST' });
	expect(result.text()).toContain('<InitiateMultipartUpload>');
	const initiated = await send(`${target.url('large')}?uploads=`, { method: 'POST' });
	expect(initiated.text()).toBe(
		'<InitiateMultipartUploadResult><UploadId>42</UploadId></InitiateMultipartUploadResult>',
	);
});

test('empty ETags use preserved mtime consistently for HEAD and listings', async () => {
	const xml =
		'<ListBucketResult><Contents><Key>a</Key><LastModified>2023-11-15T06:15:23.456Z</LastModified><ETag></ETag><Size>3</Size></Contents><Contents><Key>b</Key><ETag>valid-etag</ETag><Size>4</Size></Contents></ListBucketResult>';
	const http = testKit.request((_url, params) =>
		params.method === 'HEAD'
			? {
					headers: {
						ETag: '""',
						'Last-Modified': 'Sat, 03 Oct 2026 08:39:44 GMT',
						'X-Amz-Meta-Mtime': '1700000123.456',
					},
				}
			: { text: () => xml },
	);
	const session = new RemoteSession(target, () => true);
	const send = remoteMiddleware(http.request, session);
	const listing = await send(`${target.url('/')}?list-type=2`, {});
	expect(listing.text()).toContain('<LastModified>2023-11-14T22:15:23.000Z</LastModified>');
	expect(listing.text()).not.toContain('<ETag></ETag>');
	expect(listing.text()).toContain('<ETag>valid-etag</ETag>');
	expect(http.calls.filter(({ method }) => method === 'HEAD').map(({ url }) => url)).toEqual([
		target.url('a'),
	]);
	expect(session.received.get(target.url('a'))).toEqual({ mtime: 1_700_000_123_456 });
	const info = await send(target.url('a'), { method: 'HEAD' });
	expect(info.headers).not.toHaveProperty('ETag');
	expect(info.headers['Last-Modified']).toBe('Tue, 14 Nov 2023 22:15:23 GMT');
});

test('listing fallback uses HEAD size and ETag when the file changed during discovery', async () => {
	const http = testKit.request((_url, params) =>
		params.method === 'HEAD'
			? {
					headers: {
						'Content-Length': '9',
						ETag: '"current"',
						'Last-Modified': 'Tue, 14 Nov 2023 22:15:23 GMT',
					},
				}
			: {
					text: () =>
						'<ListBucketResult><Contents><Key>a</Key><ETag/><Size>3</Size><LastModified>2020-01-01T00:00:00Z</LastModified></Contents></ListBucketResult>',
				},
	);
	const send = remoteMiddleware(http.request, new RemoteSession(target, () => true));
	const listing = await send(`${target.url('/')}?list-type=2`);
	expect(listing.text()).toContain('<ETag>"current"</ETag>');
	expect(listing.text()).toContain('<Size>9</Size>');
});
