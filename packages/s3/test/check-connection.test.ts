import type { RequestParam } from '@hesprs/sync-engine-sdk';
import { testKit } from '@hesprs/sync-engine-sdk/dev';
import { expect, test } from 'bun:test';
import { checkConnection } from '@/s3/check-connection';
import { sigv4Middleware } from '@/s3/sigv4';
import { defaultCredentials, defaultS3Options, memoryDB, response } from './helpers';

const connectionOptions = {
	bucket: defaultS3Options.bucket,
	endpoint: defaultS3Options.endpoint,
	region: defaultS3Options.region,
	urlStyle: defaultS3Options.urlStyle,
};

test('checkConnection uses the request pipeline for a signed head bucket request', async () => {
	const harness = testKit.request<RequestParam>(() => response());

	const request = sigv4Middleware(harness.request, defaultCredentials, memoryDB);
	expect(await checkConnection(connectionOptions, request)).toStrictEqual({ success: true });

	const call = harness.calls[0];
	if (!call) throw new Error('Expected checkConnection request');
	expect(call.method).toBe('HEAD');
	expect(call.headers?.['x-amz-content-sha256']).toBe('UNSIGNED-PAYLOAD');
	expect(call.headers?.authorization).toMatch(
		/^AWS4-HMAC-SHA256 Credential=access-key\/\d{8}\/us-east-1\/s3\/aws4_request, SignedHeaders=.*?, Signature=[0-9a-f]{64}$/u,
	);
	const url = new URL(call.url);
	expect(url.pathname).toBe('/vault/');
	expect(url.search).toBe('');
});

test('checkConnection returns HTTP and thrown request failures', async () => {
	const failed = testKit.request(() => response({ status: 403 })).request;
	expect(await checkConnection(connectionOptions, failed)).toStrictEqual({
		reason: 'HTTP 403',
		success: false,
	});

	const requestError = new Error('network unavailable');
	const thrown = testKit.request(() => {
		throw requestError;
	}).request;
	expect(await checkConnection(connectionOptions, thrown)).toStrictEqual({
		reason: 'network unavailable',
		success: false,
	});
});
