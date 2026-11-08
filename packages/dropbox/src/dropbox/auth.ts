import { API_RPC, OAUTH_AUTHORIZE_URL, OAUTH_TOKEN_URL } from './api';
import { encodeBase64Url, textToUint8Array } from '@repo/shared/binary';
import { getStatus } from '@repo/shared/error';
import { compileQuery } from '@repo/shared/path';
import { requestUrl } from 'obsidian';
import type { Binary, Request, StringKV } from '@hesprs/sync-engine-sdk';
import type { ObsidianProtocolData, SecretStorage } from 'obsidian';

export const APP_KEY = atob(process.env.DROPBOX_APP_KEY ?? '');
export const REDIRECT_URI = 'obsidian://sync-engine-dropbox-auth';
export const OAUTH_SCOPE = 'files.content.read files.content.write files.metadata.read';
const KEYCHAIN_SECRET_ID = 'sync-engine-dropbox-refresh-token';
const FORM_CONTENT_TYPE = 'application/x-www-form-urlencoded';
const TOKEN_EXPIRY_MARGIN = 60_000;
const TOKEN_EXPIRY_FALLBACK = 14_400;

type TokenResponse = {
	access_token?: string;
	account_id?: string;
	expires_in?: number;
	refresh_token?: string;
} & { error?: string; error_description?: string };

export type TokenResult = {
	accessToken: string;
	expiresIn: number;
	refreshToken: string;
	accountId: string;
};

export type AuthorizationRequest = { state: string; url: string; verifier: string };

function formEncode(fields: StringKV): string {
	return new URLSearchParams(fields).toString();
}

function describeAuthError(data: TokenResponse, status: number): string {
	return data.error_description ?? data.error ?? `HTTP ${status}`;
}

async function sha256(text: string): Promise<Binary> {
	return new Uint8Array(await crypto.subtle.digest('SHA-256', textToUint8Array(text)));
}

export function buildAuthorizeUrl(state: string, codeChallenge: string): string {
	return `${OAUTH_AUTHORIZE_URL}?${compileQuery({
		client_id: APP_KEY,
		code_challenge: codeChallenge,
		code_challenge_method: 'S256',
		redirect_uri: REDIRECT_URI,
		response_type: 'code',
		scope: OAUTH_SCOPE,
		state,
		token_access_type: 'offline',
	})}`;
}

export async function startAuthorization(): Promise<AuthorizationRequest> {
	const verifier = encodeBase64Url(crypto.getRandomValues(new Uint8Array(64)));
	const state = encodeBase64Url(crypto.getRandomValues(new Uint8Array(16)));
	return {
		state,
		url: buildAuthorizeUrl(state, encodeBase64Url(await sha256(verifier))),
		verifier,
	};
}

/** Exchanges the authorization code using the PKCE verifier; no client secret is involved. */
export async function exchangeCodeForTokens(options: {
	code: string;
	verifier: string;
}): Promise<TokenResult> {
	const response = await requestUrl({
		body: formEncode({
			client_id: APP_KEY,
			code: options.code,
			code_verifier: options.verifier,
			grant_type: 'authorization_code',
			redirect_uri: REDIRECT_URI,
		}),
		contentType: FORM_CONTENT_TYPE,
		method: 'POST',
		throw: false,
		url: OAUTH_TOKEN_URL,
	});
	const data = response.json as TokenResponse;
	if (!data.access_token || !data.refresh_token || !data.account_id)
		throw new Error(
			`Dropbox authorization failed: ${describeAuthError(data, response.status)}`,
		);
	return {
		accessToken: data.access_token,
		accountId: data.account_id,
		expiresIn: data.expires_in ?? TOKEN_EXPIRY_FALLBACK,
		refreshToken: data.refresh_token,
	};
}

/**
 * Caches the short-lived access token and refreshes it with the stored refresh token when needed.
 * One instance is shared by the request middleware and the connection check so a token refresh
 * happens at most once at a time.
 */
export class TokenManager {
	private accessToken?: string;
	private expiresAt = 0;
	private pending?: Promise<string>;

	constructor(private readonly secretStorage: SecretStorage) {}

	readonly getToken = (force = false): Promise<string> => {
		if (!force && this.accessToken && Date.now() < this.expiresAt - TOKEN_EXPIRY_MARGIN)
			return Promise.resolve(this.accessToken);
		this.pending ??= this.refresh().finally(() => (this.pending = undefined));
		return this.pending;
	};

	readonly getRefreshToken = () => this.secretStorage.getSecret(KEYCHAIN_SECRET_ID);

	readonly setRefreshToken = (token: string) =>
		this.secretStorage.setSecret(KEYCHAIN_SECRET_ID, token);

	readonly deleteRefreshToken = () => this.secretStorage.deleteSecret(KEYCHAIN_SECRET_ID);

	readonly setToken = (token: string, expiresIn: number): void => {
		this.accessToken = token;
		this.expiresAt = Date.now() + expiresIn * 1000;
	};

	readonly invalidate = (): void => {
		this.accessToken = undefined;
		this.expiresAt = 0;
	};

	private async refresh(): Promise<string> {
		const refresh_token = this.getRefreshToken();
		if (!refresh_token) throw new Error('Please authorize the Dropbox account!');
		const response = await requestUrl({
			body: formEncode({ client_id: APP_KEY, grant_type: 'refresh_token', refresh_token }),
			contentType: FORM_CONTENT_TYPE,
			method: 'POST',
			throw: false,
			url: OAUTH_TOKEN_URL,
		});
		const data = response.json as TokenResponse;
		if (data.access_token) {
			this.setToken(data.access_token, data.expires_in ?? TOKEN_EXPIRY_FALLBACK);
			return data.access_token;
		}
		this.invalidate();
		if (data.error === 'invalid_grant')
			throw new Error(
				'Dropbox authorization expired or was revoked, please reconnect your Dropbox account in the settings.',
			);
		throw new Error(
			`Dropbox token refresh failed: ${describeAuthError(data, response.status)}`,
		);
	}
}

/** Injects the bearer token into every remote request and retries once on 401. */
export function bearerMiddleware(request: Request, manager: TokenManager): Request {
	return async (url, params) => {
		const send = (token: string) =>
			request(url, {
				...params,
				headers: { ...params?.headers, Authorization: `Bearer ${token}` },
			});
		try {
			return await send(await manager.getToken());
		} catch (error: unknown) {
			if (getStatus(error) !== 401) throw error;
			manager.invalidate();
			return send(await manager.getToken(true));
		}
	};
}

/** Revokes the token set derived from the current refresh token. Fire-and-forget. */
export async function revokeToken(manager: TokenManager): Promise<void> {
	try {
		const token = await manager.getToken();
		await requestUrl({
			headers: { Authorization: `Bearer ${token}` },
			method: 'POST',
			throw: false,
			url: `${API_RPC}/2/auth/token/revoke`,
		});
	} catch {
		// Best-effort; the token also expires on its own.
	}
}

/**
 * Correlates the `obsidian://sync-engine-dropbox-auth` callback with the pending authorization
 * request; callbacks with mismatched or missing state are ignored.
 */
export class PendingAuthorization {
	private readonly waiters = new Map<
		string,
		{ resolve: (result: { code: string }) => void; reject: (reason: Error) => void }
	>();

	notify = (data: ObsidianProtocolData): void => {
		const { code, error, state } = data;
		if (state === undefined) return;
		const waiter = this.waiters.get(state);
		if (!waiter) return;
		this.waiters.delete(state);
		if (code === undefined)
			waiter.reject(new Error(`Dropbox authorization failed: ${error ?? 'unknown error'}.`));
		else waiter.resolve({ code });
	};

	waitFor = (state: string): Promise<{ code: string }> =>
		new Promise((resolve, reject) => {
			this.waiters.set(state, { reject, resolve });
		});

	cancel = (state: string): void => {
		const waiter = this.waiters.get(state);
		if (!waiter) return;
		this.waiters.delete(state);
		waiter.reject(new Error('Dropbox connection was cancelled.'));
	};
}
