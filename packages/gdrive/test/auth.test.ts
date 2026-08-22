import type { Request, RequestParam, RequestResponse } from '@hesprs/sync-engine-sdk';
import { expect, test } from 'bun:test';
import type { AuthHttp } from '@/gdrive/auth';
import {
	TokenManager,
	bearerMiddleware,
	decodeIdTokenEmail,
	pollDeviceToken,
	startDeviceAuthorization,
} from '@/gdrive/auth';

type AuthResponse = { status: number; body: unknown };

function scriptedHttp(responses: Array<AuthResponse>) {
	const calls: Array<{ url: string; body: string }> = [];
	const http: AuthHttp = ({ url, body }) => {
		calls.push({ body: body ?? '', url });
		const next = responses.shift();
		if (!next) throw new Error('scripted http exhausted');
		return Promise.resolve({ json: () => next.body, status: next.status });
	};
	return { calls, http };
}

function fakeIdToken(email: string): string {
	const payload = btoa(JSON.stringify({ email }))
		.replaceAll('+', '-')
		.replaceAll('/', '_')
		.replaceAll('=', '');
	return `header.${payload}.signature`;
}

const AUTHORIZATION = {
	deviceCode: 'device-1',
	expiresIn: 1800,
	interval: 5,
	userCode: 'ABCD-EFGH',
	verificationUrl: 'https://www.google.com/device',
};

test('startDeviceAuthorization parses the device code response', async () => {
	const { calls, http } = scriptedHttp([
		{
			body: {
				device_code: 'device-1',
				expires_in: 900,
				interval: 7,
				user_code: 'ABCD-EFGH',
				verification_url: 'https://www.google.com/device',
			},
			status: 200,
		},
	]);
	const authorization = await startDeviceAuthorization(http, 'client-1');
	expect(authorization).toStrictEqual({
		deviceCode: 'device-1',
		expiresIn: 900,
		interval: 7,
		userCode: 'ABCD-EFGH',
		verificationUrl: 'https://www.google.com/device',
	});
	expect(calls[0]?.body).toContain('client_id=client-1');
	expect(calls[0]?.body).toContain('drive.file');
});

test('startDeviceAuthorization surfaces Google error descriptions', async () => {
	const { http } = scriptedHttp([
		{ body: { error: 'invalid_client', error_description: 'Unknown client.' }, status: 401 },
	]);
	await expect(startDeviceAuthorization(http, 'client-1')).rejects.toThrow('Unknown client.');
});

test('pollDeviceToken waits through pending, honors slow_down, and resolves tokens', async () => {
	const { calls, http } = scriptedHttp([
		{ body: { error: 'authorization_pending' }, status: 428 },
		{ body: { error: 'slow_down' }, status: 428 },
		{
			body: {
				access_token: 'access-1',
				expires_in: 3599,
				id_token: fakeIdToken('user@example.com'),
				refresh_token: 'refresh-1',
			},
			status: 200,
		},
	]);
	const sleeps: Array<number> = [];
	const result = await pollDeviceToken(http, {
		authorization: AUTHORIZATION,
		clientId: 'client-1',
		clientSecret: 'secret-1',
		sleep: (ms) => {
			sleeps.push(ms);
			return Promise.resolve();
		},
	});
	expect(result).toStrictEqual({
		accessToken: 'access-1',
		email: 'user@example.com',
		expiresIn: 3599,
		refreshToken: 'refresh-1',
	});
	expect(sleeps).toStrictEqual([5000, 5000, 10_000]);
	expect(calls[0]?.body).toContain(
		'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Adevice_code',
	);
});

test('pollDeviceToken maps denial, expiry, and cancellation to clear errors', async () => {
	const denied = scriptedHttp([{ body: { error: 'access_denied' }, status: 403 }]);
	await expect(
		pollDeviceToken(denied.http, {
			authorization: AUTHORIZATION,
			clientId: 'c',
			clientSecret: 's',
			sleep: () => Promise.resolve(),
		}),
	).rejects.toThrow('denied');

	const expired = scriptedHttp([{ body: { error: 'expired_token' }, status: 428 }]);
	await expect(
		pollDeviceToken(expired.http, {
			authorization: AUTHORIZATION,
			clientId: 'c',
			clientSecret: 's',
			sleep: () => Promise.resolve(),
		}),
	).rejects.toThrow('expired');

	const cancelled = scriptedHttp([]);
	await expect(
		pollDeviceToken(cancelled.http, {
			authorization: AUTHORIZATION,
			clientId: 'c',
			clientSecret: 's',
			isCancelled: () => true,
			sleep: () => Promise.resolve(),
		}),
	).rejects.toThrow('cancelled');
});

test('TokenManager caches tokens, refreshes on expiry, and dedupes concurrent refreshes', async () => {
	let clock = 0;
	const { calls, http } = scriptedHttp([
		{ body: { access_token: 'token-a', expires_in: 3600 }, status: 200 },
		{ body: { access_token: 'token-b', expires_in: 3600 }, status: 200 },
	]);
	const manager = new TokenManager(
		http,
		() => ({ clientId: 'c', clientSecret: 's', refreshToken: 'r' }),
		() => clock,
	);
	const [first, second] = await Promise.all([manager.getToken(), manager.getToken()]);
	expect(first).toBe('token-a');
	expect(second).toBe('token-a');
	expect(calls.length).toBe(1);
	expect(await manager.getToken()).toBe('token-a');
	clock = 3600 * 1000; // Past expiry minus the safety margin.
	expect(await manager.getToken()).toBe('token-b');
	expect(calls.length).toBe(2);
	expect(calls[0]?.body).toContain('grant_type=refresh_token');
});

test('TokenManager reports revoked authorization clearly', async () => {
	const { http } = scriptedHttp([{ body: { error: 'invalid_grant' }, status: 400 }]);
	const manager = new TokenManager(http, () => ({
		clientId: 'c',
		clientSecret: 's',
		refreshToken: 'r',
	}));
	await expect(manager.getToken()).rejects.toThrow('reconnect');
});

test('bearerMiddleware injects the token and retries once after a 401', async () => {
	const tokenHttp = scriptedHttp([
		{ body: { access_token: 'stale', expires_in: 3600 }, status: 200 },
		{ body: { access_token: 'fresh', expires_in: 3600 }, status: 200 },
	]);
	const manager = new TokenManager(tokenHttp.http, () => ({
		clientId: 'c',
		clientSecret: 's',
		refreshToken: 'r',
	}));
	const seenAuth: Array<string | undefined> = [];
	const inner: Request = (params: RequestParam | string) => {
		if (typeof params === 'string') throw new Error('unexpected string request');
		seenAuth.push(params.headers?.Authorization);
		const status = seenAuth.length === 1 ? 401 : 200;
		const response: RequestResponse = {
			bytes: () => new Uint8Array(0),
			headers: {},
			json: () => ({}),
			status,
			text: () => '',
		};
		return Promise.resolve(response);
	};
	const request = bearerMiddleware(inner, manager);
	const response = await request({ method: 'GET', url: 'https://example.com' });
	expect(response.status).toBe(200);
	expect(seenAuth).toStrictEqual(['Bearer stale', 'Bearer fresh']);
});

test('decodeIdTokenEmail tolerates malformed tokens', () => {
	expect(decodeIdTokenEmail(fakeIdToken('a@b.c'))).toBe('a@b.c');
	expect(decodeIdTokenEmail('garbage')).toBeUndefined();
	expect(decodeIdTokenEmail('a.b.c')).toBeUndefined();
});
