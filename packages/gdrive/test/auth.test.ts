import type { Request, RequestParam, RequestResponse } from '@hesprs/sync-engine-sdk';
import type { SecretStorage } from 'obsidian';
import * as ObsidianMock from '@repo/shared/mocks';
import { expect, mock, test } from 'bun:test';

type HttpResponse = { json: unknown; status?: number };
const requests: Array<RequestParam> = [];
let responses: Array<HttpResponse> = [];

void mock.module('obsidian', () => ({
	...ObsidianMock,
	requestUrl: (params: RequestParam) => {
		requests.push(params);
		const response = responses.shift();
		if (!response) throw new Error('Unexpected request');
		return Promise.resolve({ json: response.json, status: response.status ?? 200 });
	},
}));

const { TokenManager, bearerMiddleware, pollDeviceToken, startDeviceAuthorization } =
	await import('@/gdrive/auth');

function reset(...next: Array<HttpResponse>) {
	requests.length = 0;
	responses = [...next];
}

test('starts device authorization from Google response', async () => {
	reset({
		json: {
			device_code: 'device',
			expires_in: 900,
			interval: 0,
			user_code: 'ABCD',
			verification_url: 'https://google.test/device',
		},
	});

	expect(await startDeviceAuthorization()).toStrictEqual({
		deviceCode: 'device',
		expiresIn: 900,
		interval: 0,
		userCode: 'ABCD',
		verificationUrl: 'https://google.test/device',
	});
	expect(requests[0]?.method).toBe('POST');
});

test('polls device authorization and extracts user id from ID token', async () => {
	const payload = btoa(JSON.stringify({ sub: 'google-user' }))
		.replaceAll('+', '-')
		.replaceAll('/', '_')
		.replaceAll('=', '');
	reset({
		json: {
			access_token: 'access',
			expires_in: 3600,
			id_token: `header.${payload}.signature`,
			refresh_token: 'refresh',
		},
	});

	expect(
		await pollDeviceToken({
			authorization: {
				deviceCode: 'device',
				expiresIn: 60,
				interval: 0,
				userCode: 'code',
				verificationUrl: 'url',
			},
			isCancelled: () => false,
		}),
	).toStrictEqual({
		accessToken: 'access',
		expiresIn: 3600,
		refreshToken: 'refresh',
		userId: 'google-user',
	});
});

test('caches tokens and retries bearer requests after a 401', async () => {
	reset(
		{ json: { access_token: 'first', expires_in: 3600 } },
		{ json: { access_token: 'second', expires_in: 3600 } },
	);
	const secrets = new Map([['sync-engine-gdrive-refresh-token', 'refresh']]);
	const storage = {
		deleteSecret: (id: string) => void secrets.delete(id),
		getSecret: (id: string) => secrets.get(id),
		setSecret: (id: string, value: string) => void secrets.set(id, value),
	};
	const manager = new TokenManager(storage as unknown as SecretStorage);
	const seen: Array<string | undefined> = [];
	const request: Request = (params) => {
		if (typeof params === 'string') throw new Error('Unexpected string request');
		seen.push(params.headers?.Authorization);
		if (seen.length === 1) {
			const error = new Error('Unauthorized') as Error & { status: number };
			error.status = 401;
			return Promise.reject(error);
		}
		return Promise.resolve({
			bytes: () => new Uint8Array(0),
			headers: {},
			json: () => ({}),
			status: 200,
			text: () => '',
		} satisfies RequestResponse);
	};

	const wrapped = bearerMiddleware(request, manager);
	expect((await wrapped({ method: 'GET', url: 'https://drive.test' })).status).toBe(200);
	expect(seen).toStrictEqual(['Bearer first', 'Bearer second']);
});
