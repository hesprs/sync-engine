import type { Request, RequestParam } from '@hesprs/sync-engine-sdk';
import { testKit } from '@hesprs/sync-engine-sdk/dev';
import { beforeEach, expect, test } from 'bun:test';
import { sigv4Middleware } from '@/s3/sigv4';
import { defaultCredentials, memoryDB, response } from './helpers';

beforeEach(() => {
	memoryDB.clearStores();
	memoryDB.setMeta('s3Key', undefined);
	memoryDB.setMeta('s3KeyMarker', '');
});

function createTransport() {
	const harness = testKit.request(() => response());
	return { calls: harness.calls, transport: harness.request };
}

function assertSignature(params: RequestParam) {
	expect(params.headers?.['x-amz-content-sha256']).toBe('UNSIGNED-PAYLOAD');
	expect(params.headers?.['x-amz-date']).toMatch(/^\d{8}T\d{6}Z$/u);
	expect(params.headers?.['x-amz-security-token']).toBe('session-token');
	expect(params.headers?.authorization).toMatch(
		/^AWS4-HMAC-SHA256 Credential=access-key\/\d{8}\/us-east-1\/s3\/aws4_request, SignedHeaders=.*?, Signature=[0-9a-f]{64}$/u,
	);
}

test('middleware signs request parameters without changing body or URL', async () => {
	const { calls, transport } = createTransport();
	const request = sigv4Middleware(transport, defaultCredentials, memoryDB);
	const body = new Uint8Array([1, 2, 3]);

	await request('https://s3.example.com/vault/file.bin', {
		body,
		headers: { 'Content-Type': 'application/octet-stream' },
		method: 'PUT',
	});

	const call = calls[0];
	if (!call) throw new Error('Expected transport request');
	expect(call.body).toBe(body);
	expect(call.url).toBe('https://s3.example.com/vault/file.bin');
	expect(call.headers?.['Content-Type']).toBe('application/octet-stream');
	assertSignature(call);
});

test('middleware signs temporary session credentials with the security token', async () => {
	const { calls, transport } = createTransport();
	await sigv4Middleware(
		transport,
		defaultCredentials,
		memoryDB,
	)('https://s3.example.com/vault/file.md');

	const call = calls[0];
	if (!call) throw new Error('Expected transport request');
	expect(call.headers?.['x-amz-security-token']).toBe('session-token');
	expect(call.headers?.authorization).toContain('x-amz-security-token');
});

test('middleware defaults to GET when no params are given', async () => {
	const { calls, transport } = createTransport();
	const request = sigv4Middleware(transport, defaultCredentials, memoryDB);

	await request('https://s3.example.com/vault/file.md');

	const call = calls[0];
	if (!call) throw new Error('Expected transport request');
	expect(call.method).toBe('GET');
	expect(call.url).toBe('https://s3.example.com/vault/file.md');
	assertSignature(call);
});

test('middleware signs custom headers before proxy rewrites the URL', async () => {
	const { calls, transport } = createTransport();
	const proxy =
		(request: Request): Request =>
		(url, params) => {
			const original = new URL(url);
			return request(
				`https://proxy.example.com${original.pathname}${original.search}`,
				params,
			);
		};
	const signed = sigv4Middleware(proxy(transport), defaultCredentials, memoryDB);

	await signed('https://s3.example.com/vault/file.md', { headers: { 'x-custom': 'value' } });

	const call = calls[0];
	if (!call) throw new Error('Expected transport request');
	expect(call.url).toBe('https://proxy.example.com/vault/file.md');
	expect(call.headers?.['x-custom']).toBe('value');
	expect(call.headers?.authorization).toContain(
		'SignedHeaders=host;x-amz-content-sha256;x-amz-date;x-amz-security-token;x-custom',
	);
});

test("middleware overrides Electron's no-cors fetch mode as an unsigned header", async () => {
	const { calls, transport } = createTransport();
	const request = sigv4Middleware(transport, defaultCredentials, memoryDB);

	await request('https://s3.example.com/vault/file.bin', { method: 'POST' });

	const call = calls[0];
	if (!call) throw new Error('Expected transport request');
	expect(call.headers?.['Sec-Fetch-Mode']).toBe('navigate');
	expect(call.headers?.authorization).not.toContain('sec-fetch-mode');
});

test('middleware reuses signing key for matching credentials and date', async () => {
	const { transport } = createTransport();
	const request = sigv4Middleware(transport, defaultCredentials, memoryDB);

	await request('https://s3.example.com/vault/first.md');
	const signingKey = memoryDB.getMeta('s3Key');
	if (!signingKey) throw new Error('Expected signing key cache entry');

	await request('https://s3.example.com/vault/second.md');

	expect(memoryDB.getMeta('s3Key')).toBe(signingKey);
	expect(memoryDB.getMeta('s3KeyMarker')).toMatch(/^secret-key~\d{8}~us-east-1~s3$/u);
});
