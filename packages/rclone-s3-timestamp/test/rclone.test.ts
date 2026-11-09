import rcloneS3Timestamp from '@';
import { testKit } from '@hesprs/sync-engine-sdk/dev';
import { expect, test } from 'bun:test';
import type { RemoteRequestMiddlewareEntry, Request } from '@hesprs/sync-engine-sdk';

const MS = '1700000123456';
const SECONDS = '1700000123.456';
const CTIME = '1600000123456';
const ENCRYPTED = 'dGVzdC1lbmNyeXB0ZWQtbXRpbWU=';

function registeredApply(remoteFs: string) {
	let entry: RemoteRequestMiddlewareEntry | undefined;
	new rcloneS3Timestamp({
		registerRemoteRequestMiddleware: (registered) => {
			entry = registered;
			return () => {};
		},
		settings: { remoteFs },
	}).start();
	return entry?.apply;
}

function wrap(base: Request): Request {
	const apply = registeredApply('s3');
	if (!apply) throw new Error('Expected middleware for the s3 remote');
	const wrapped = apply(base);
	if (!wrapped) throw new Error('Expected the middleware to wrap the request');
	return wrapped;
}

test('middleware converts mtime milliseconds to rclone seconds on upload', async () => {
	const { calls, request } = testKit.request(() => ({}));
	const params = {
		headers: {
			'x-amz-meta-ctime': CTIME,
			'x-amz-meta-custom': 'value',
			'x-amz-meta-mtime': MS,
		},
		method: 'PUT',
	};

	await wrap(request)('https://rclone.example.com/vault/note.md', params);

	const call = calls[0];
	if (!call) throw new Error('Expected transport request');
	expect(call.headers).toEqual({
		'x-amz-meta-ctime': CTIME,
		'x-amz-meta-custom': 'value',
		'x-amz-meta-mtime': SECONDS,
	});
	expect(params.headers?.['x-amz-meta-mtime']).toBe(MS);
});

test('middleware preserves non-timestamp mtime (encrypted meta) on upload', async () => {
	const { calls, request } = testKit.request(() => ({}));

	await wrap(request)('https://rclone.example.com/vault/note.md', {
		headers: { 'x-amz-meta-mtime': ENCRYPTED },
		method: 'PUT',
	});

	expect(calls[0]?.headers?.['x-amz-meta-mtime']).toBe(ENCRYPTED);
});

test('middleware converts rclone seconds back to milliseconds on download', async () => {
	const { request } = testKit.request(() => ({
		headers: {
			'X-Amz-Meta-Mtime': SECONDS,
			etag: '"d41d8cd98f00b204e9800998ecf8427e"',
			'x-amz-meta-ctime': CTIME,
		},
	}));

	const response = await wrap(request)('https://rclone.example.com/vault/note.md');

	expect(response.headers['X-Amz-Meta-Mtime']).toBe(MS);
	expect(response.headers['x-amz-meta-ctime']).toBe(CTIME);
	expect(response.headers.etag).toBe('"d41d8cd98f00b204e9800998ecf8427e"');
	expect(response.status).toBe(200);
	expect(response.text()).toBe('ok');
});

test('middleware preserves non-numeric mtime (encrypted meta) on download', async () => {
	const { request } = testKit.request(() => ({ headers: { 'x-amz-meta-mtime': ENCRYPTED } }));

	const response = await wrap(request)('https://rclone.example.com/vault/note.md');

	expect(response.headers['x-amz-meta-mtime']).toBe(ENCRYPTED);
});
