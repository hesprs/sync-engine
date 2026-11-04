import { API_RPC, OAUTH_TOKEN_URL } from '@/dropbox/api';
import { testKit } from '@hesprs/sync-engine-sdk/dev';
import ObsidianMock from '@repo/shared/obsidian-mock';
import { expect, mock, test } from 'bun:test';
import type { RequestParam, StringKV } from '@hesprs/sync-engine-sdk';
import type { ObsidianProtocolData, SecretStorage } from 'obsidian';

const { request } = testKit;

type HttpResponse = { json?: unknown; status?: number; text?: string };
const requests: Array<RequestParam & { url: string }> = [];
let responses: Array<HttpResponse> = [];

void mock.module('obsidian', () => ({
	...ObsidianMock,
	requestUrl: (params: RequestParam & { url: string }) => {
		requests.push(params);
		const response = responses.shift();
		if (!response) throw new Error('Unexpected request');
		return Promise.resolve({
			json: response.json,
			status: response.status ?? 200,
			text: response.text ?? '',
		});
	},
}));

const {
	APP_KEY,
	PendingAuthorization,
	TokenManager,
	bearerMiddleware,
	buildAuthorizeUrl,
	exchangeCodeForTokens,
	revokeToken,
	startAuthorization,
} = await import('@/dropbox/auth');

function reset(...next: Array<HttpResponse>) {
	requests.length = 0;
	responses = [...next];
}

function createSecrets(initial = 'refresh') {
	const secrets = new Map([['sync-engine-dropbox-refresh-token', initial]]);
	const storage = {
		deleteSecret: (id: string) => void secrets.delete(id),
		getSecret: (id: string) => secrets.get(id),
		setSecret: (id: string, value: string) => void secrets.set(id, value),
	};
	return storage as unknown as SecretStorage;
}

function formBody(index: number): URLSearchParams {
	return new URLSearchParams(String(requests[index]?.body));
}

function callback(fields: StringKV): ObsidianProtocolData {
	return { action: 'sync-engine-dropbox-auth', ...fields } as ObsidianProtocolData;
}

test('starts an authorization with an S256 challenge and offline access', async () => {
	const { state, url, verifier } = await startAuthorization();

	const parsed = new URL(url);
	expect(parsed.origin + parsed.pathname).toBe('https://www.dropbox.com/oauth2/authorize');
	expect(parsed.searchParams.get('client_id')).toBe(APP_KEY);
	expect(parsed.searchParams.get('redirect_uri')).toBe('obsidian://sync-engine-dropbox-auth');
	expect(parsed.searchParams.get('response_type')).toBe('code');
	expect(parsed.searchParams.get('token_access_type')).toBe('offline');
	expect(parsed.searchParams.get('code_challenge_method')).toBe('S256');
	expect(parsed.searchParams.get('scope')).toBe(
		'files.content.read files.content.write files.metadata.read',
	);
	expect(parsed.searchParams.get('state')).toBe(state);
	expect(verifier.length).toBeGreaterThanOrEqual(43);
	expect(verifier.length).toBeLessThanOrEqual(128);

	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
	const expected = btoa(String.fromCodePoint(...new Uint8Array(digest)))
		.replaceAll('+', '-')
		.replaceAll('/', '_')
		.replaceAll('=', '');
	expect(parsed.searchParams.get('code_challenge')).toBe(expected);
});

test('builds the authorize URL from explicit challenge values', () => {
	expect(buildAuthorizeUrl('state-1', 'challenge-1')).toBe(
		`https://www.dropbox.com/oauth2/authorize?client_id=${encodeURIComponent(
			APP_KEY,
		)}&redirect_uri=${encodeURIComponent(
			'obsidian://sync-engine-dropbox-auth',
		)}&response_type=code` +
			`&code_challenge=challenge-1` +
			`&code_challenge_method=S256` +
			`&token_access_type=offline` +
			`&scope=${encodeURIComponent(
				'files.content.read files.content.write files.metadata.read',
			)}&state=state-1`,
	);
});

test('exchanges the code with the PKCE verifier and no secret', async () => {
	reset({
		json: {
			access_token: 'access',
			account_id: 'dbid:1',
			expires_in: 14_400,
			refresh_token: 'refresh',
		},
	});

	const result = await exchangeCodeForTokens({ code: 'the-code', verifier: 'the-verifier' });
	expect(result).toStrictEqual({
		accessToken: 'access',
		accountId: 'dbid:1',
		expiresIn: 14_400,
		refreshToken: 'refresh',
	});
	expect(requests[0]?.url).toBe(OAUTH_TOKEN_URL);
	const body = formBody(0);
	expect(body.get('code')).toBe('the-code');
	expect(body.get('code_verifier')).toBe('the-verifier');
	expect(body.get('grant_type')).toBe('authorization_code');
	expect(body.get('redirect_uri')).toBe('obsidian://sync-engine-dropbox-auth');
	expect(body.get('client_id')).toBe(APP_KEY);
	expect(body.get('client_secret')).toBeNull();
});

test('surfaces token endpoint errors', async () => {
	reset({ json: { error: 'invalid_grant', error_description: 'expired code' }, status: 400 });

	let caught: unknown;
	try {
		await exchangeCodeForTokens({ code: 'stale', verifier: 'verifier' });
	} catch (error) {
		caught = error;
	}
	expect(String(caught)).toContain('expired code');
});

test('refreshes tokens without a secret and caches them', async () => {
	reset({ json: { access_token: 'access', expires_in: 14_400 } });
	const manager = new TokenManager(createSecrets());

	expect(await manager.getToken()).toBe('access');
	expect(await manager.getToken()).toBe('access');
	expect(requests.length).toBe(1);
	const body = formBody(0);
	expect(body.get('grant_type')).toBe('refresh_token');
	expect(body.get('refresh_token')).toBe('refresh');
	expect(body.get('client_id')).toBe(APP_KEY);
	expect(body.get('client_secret')).toBeNull();
});

test('asks to reconnect when the refresh token is revoked', async () => {
	reset({ json: { error: 'invalid_grant', error_description: 'revoked' }, status: 400 });
	const manager = new TokenManager(createSecrets());

	let caught: unknown;
	try {
		await manager.getToken();
	} catch (error) {
		caught = error;
	}
	expect(String(caught)).toContain('reconnect');
});

test('caches tokens and retries bearer requests after a 401', async () => {
	reset(
		{ json: { access_token: 'first', expires_in: 14_400 } },
		{ json: { access_token: 'second', expires_in: 14_400 } },
	);
	const manager = new TokenManager(createSecrets());
	const seen: Array<string | undefined> = [];
	const req = request((url, params) => {
		seen.push(params.headers?.Authorization);
		if (seen.length === 1) {
			const error = new Error('Unauthorized') as Error & { status: number };
			error.status = 401;
			return Promise.reject(error);
		}
		return { status: 200 };
	});

	const wrapped = bearerMiddleware(req.request, manager);
	expect((await wrapped('https://api.dropbox.test')).status).toBe(200);
	expect(seen).toStrictEqual(['Bearer first', 'Bearer second']);
});

test('revokes the current token set derived from the refresh token', async () => {
	reset({ json: { access_token: 'access', expires_in: 14_400 } }, {});
	const manager = new TokenManager(createSecrets());
	await revokeToken(manager);

	expect(requests[1]?.url).toBe(`${API_RPC}/2/auth/token/revoke`);
	expect(requests[1]?.headers?.Authorization).toBe('Bearer access');
});

test('pending authorization resolves only its matching callback', async () => {
	const pending = new PendingAuthorization();
	const first = pending.waitFor('state-1');

	pending.notify(callback({ code: 'wrong', state: 'state-2' }));
	pending.notify(callback({ code: 'right', state: 'state-1' }));
	expect(await first).toStrictEqual({ code: 'right' });
});

test('pending authorization surfaces denial and cancellation', () => {
	const pending = new PendingAuthorization();
	const denied = pending.waitFor('state-1');
	pending.notify(callback({ error: 'access_denied', state: 'state-1' }));
	expect(denied).rejects.toThrow('denied');

	const cancelled = pending.waitFor('state-2');
	pending.cancel('state-2');
	expect(cancelled).rejects.toThrow('cancelled');
});
