import { testKit } from '@hesprs/sync-engine-sdk/dev';
import { expect, mock, test } from 'bun:test';
import { checkConnection } from '@/s3/check-connection';
import { sigv4Middleware } from '@/s3/sigv4';
import { defaultCredentials, defaultS3Options, memoryDB, response } from './helpers';

void mock.module('@repo/shared/parse-xml', () => ({
	default: (xml: string) => {
		if (!xml) throw new Error('empty XML');
		return { Error: { Code: 'AccessDenied', Message: 'Access Denied' } };
	},
}));

const connectionOptions = {
	bucket: defaultS3Options.bucket,
	endpoint: defaultS3Options.endpoint,
	region: defaultS3Options.region,
	urlStyle: defaultS3Options.urlStyle,
};

test('checkConnection uses the request pipeline for a signed empty list request', async () => {
	const harness = testKit.request(() => response());

	const request = sigv4Middleware(harness.request, defaultCredentials, memoryDB);
	expect(await checkConnection(connectionOptions, request)).toStrictEqual({ success: true });

	const call = harness.calls[0];
	if (!call) throw new Error('Expected checkConnection request');
	expect(call.method).toBe('GET');
	expect(call.headers?.['x-amz-content-sha256']).toBe('UNSIGNED-PAYLOAD');
	expect(call.headers?.authorization).toMatch(
		/^AWS4-HMAC-SHA256 Credential=access-key\/\d{8}\/us-east-1\/s3\/aws4_request, SignedHeaders=.*?, Signature=[0-9a-f]{64}$/u,
	);
	const url = new URL(call.url);
	expect(url.pathname).toBe('/vault/');
	expect(url.searchParams.get('list-type')).toBe('2');
	expect(url.searchParams.get('max-keys')).toBe('0');
});

test('checkConnection surfaces the S3 error body on failure', async () => {
	const denied = testKit.request(() =>
		response({ status: 403, text: '<Error>...</Error>' }),
	).request;
	expect(await checkConnection(connectionOptions, denied)).toStrictEqual({
		reason: 'S3 AccessDenied: Access Denied',
		success: false,
	});
});

test('checkConnection returns HTTP and thrown request failures', async () => {
	const failed = testKit.request(() => response({ status: 403 })).request;
	expect(await checkConnection(connectionOptions, failed)).toStrictEqual({
		reason: 'S3: HTTP 403',
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
