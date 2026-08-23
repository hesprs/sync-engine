import type { Request, RequestParam } from '@hesprs/sync-engine-sdk';
import { getStatus } from '@repo/shared/get-status';
import { requestUrl, SecretStorage } from 'obsidian';
import {
	buildUrl,
	OAUTH_DEVICE_CODE_URL,
	OAUTH_SCOPE,
	OAUTH_TOKEN_URL,
	TOKEN_REVOKE_URL,
} from './api';

export const CLIENT_ID = atob(process.env.CLIENT_ID ?? '');
export const CLIENT_SECRET = atob(process.env.CLIENT_SECRET ?? ''); // Not really a secret
const KEYCHAIN_SECRET_ID = 'sync-engine-gdrive-refresh-token'; // Secret storage id under which the Google refresh token is stored.

type TokenResponse = {
	access_token: string;
	expires_in: number;
	refresh_token?: string;
	id_token?: string;
};

type TokenError = {
	error:
		| 'invalid_request'
		| 'invalid_client'
		| 'invalid_grant'
		| 'unauthorized_client'
		| 'unsupported_grant_type'
		| 'authorization_pending'
		| 'slow_down'
		| 'expired_token'
		| 'access_denied';
	error_description?: string;
};

type DeviceCodeResponse = {
	device_code: string;
	user_code: string;
	verification_url: string;
	expires_in: number;
	interval: number;
};

type DeviceCodeError = {
	error: 'invalid_request' | 'invalid_client' | 'unsupported_grant_type' | 'unauthorized_client';
	error_description?: string;
};

export type DeviceAuthorization = {
	deviceCode: string;
	userCode: string;
	verificationUrl: string;
	expiresIn: number;
	interval: number;
};

export type DeviceTokenResult = {
	accessToken: string;
	refreshToken: string;
	expiresIn: number;
	userId: string;
};

const FORM_CONTENT_TYPE = 'application/x-www-form-urlencoded';

function formEncode(fields: Record<string, string>): string {
	return new URLSearchParams(fields).toString();
}

function describeAuthError(data: TokenError, status: number): string {
	return data.error_description ?? data.error ?? `HTTP ${status}`;
}

export async function startDeviceAuthorization(): Promise<DeviceAuthorization> {
	const response = await requestUrl({
		body: formEncode({ client_id: CLIENT_ID, scope: OAUTH_SCOPE }),
		contentType: FORM_CONTENT_TYPE,
		method: 'POST',
		throw: false,
		url: OAUTH_DEVICE_CODE_URL,
	});
	const data = response.json as DeviceCodeResponse | DeviceCodeError;
	if ('error' in data)
		throw new Error(
			`Google device authorization failed: ${describeAuthError(data, response.status)}`,
		);
	return {
		deviceCode: data.device_code,
		expiresIn: data.expires_in,
		interval: data.interval,
		userCode: data.user_code,
		verificationUrl: data.verification_url,
	};
}

export async function pollDeviceToken(options: {
	authorization: DeviceAuthorization;
	isCancelled: () => boolean;
}): Promise<DeviceTokenResult> {
	let interval = Math.max(options.authorization.interval, 1);
	const deadline = Date.now() + options.authorization.expiresIn * 1000;
	while (true) {
		await sleep(interval * 1000);
		if (options.isCancelled?.()) throw new Error('Google Drive connection was cancelled.');
		if (Date.now() > deadline)
			throw new Error('The device code expired, please try connecting again.');
		const response = await requestUrl({
			body: formEncode({
				client_id: CLIENT_ID,
				client_secret: CLIENT_SECRET,
				device_code: options.authorization.deviceCode,
				grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
			}),
			contentType: FORM_CONTENT_TYPE,
			method: 'POST',
			throw: false,
			url: OAUTH_TOKEN_URL,
		});
		const data = response.json as TokenResponse | TokenError;
		if ('access_token' in data)
			if (data.refresh_token && data.id_token)
				return {
					accessToken: data.access_token,
					expiresIn: data.expires_in,
					refreshToken: data.refresh_token,
					userId: extractSub(data.id_token),
				};
			else throw new Error('Google authorization payload is malformed!');
		switch (data.error) {
			case 'authorization_pending': {
				continue;
			}
			case 'slow_down': {
				interval += 5;
				continue;
			}
			case 'access_denied': {
				throw new Error('Google Drive access was denied.');
			}
			case 'expired_token': {
				throw new Error('The device code expired, please try connecting again.');
			}
			default: {
				throw new Error(
					`Google Drive connection failed: ${describeAuthError(data, response.status)}`,
				);
			}
		}
	}
}
function extractSub(idToken: string): string {
	const payload = JSON.parse(atob(idToken.split('.')[1])) as { sub: string };
	return payload.sub;
}

// Fire-and-forget revocation
export function revokeToken(token: string) {
	return requestUrl({
		contentType: FORM_CONTENT_TYPE,
		method: 'POST',
		throw: false,
		url: buildUrl(TOKEN_REVOKE_URL, '', { token }),
	}).catch(() => {});
}

/**
 * Caches the short-lived access token and refreshes it with the stored refresh
 * token when needed. One instance is shared by the request middleware and the
 * connection check so a token refresh happens at most once at a time.
 */
export class TokenManager {
	private accessToken?: string;
	private expiresAt = 0;
	private pending?: Promise<string>;

	constructor(private readonly secretStorage: SecretStorage) {}

	readonly getToken = (force = false): Promise<string> => {
		if (!force && this.accessToken && Date.now() < this.expiresAt - 60_000)
			return Promise.resolve(this.accessToken);
		this.pending ??= this.refresh().finally(() => (this.pending = undefined));
		return this.pending;
	};

	readonly getRefreshToken = () => this.secretStorage.getSecret(KEYCHAIN_SECRET_ID);

	readonly setRefreshToken = (token: string) =>
		this.secretStorage.setSecret(KEYCHAIN_SECRET_ID, token);

	readonly deleteRefreshToken = () => this.secretStorage.deleteSecret(KEYCHAIN_SECRET_ID);

	readonly setToken = (token: string, expiresIn: number) => {
		this.accessToken = token;
		this.expiresAt = Date.now() + expiresIn * 1000;
	};

	readonly invalidate = (): void => {
		this.accessToken = undefined;
		this.expiresAt = 0;
	};

	private async refresh(): Promise<string> {
		const refresh_token = this.getRefreshToken();
		if (!refresh_token) throw new Error('Please authorize Google Account!');
		const response = await requestUrl({
			body: formEncode({
				client_id: CLIENT_ID,
				client_secret: CLIENT_SECRET,
				grant_type: 'refresh_token',
				refresh_token,
			}),
			contentType: FORM_CONTENT_TYPE,
			method: 'POST',
			throw: false,
			url: OAUTH_TOKEN_URL,
		});
		const data = response.json as TokenResponse | TokenError;
		if ('access_token' in data) {
			this.accessToken = data.access_token;
			this.expiresAt = Date.now() + data.expires_in * 1000;
			return data.access_token;
		}
		this.invalidate();
		if (data.error === 'invalid_grant')
			throw new Error(
				'Google Drive authorization expired or was revoked, please reconnect your Google account in the settings.',
			);
		throw new Error(
			`Google Drive token refresh failed: ${describeAuthError(data, response.status)}`,
		);
	}
}

/** Injects the bearer token into every remote request and retries once on 401. */
export function bearerMiddleware(request: Request, manager: TokenManager): Request {
	return async (params) => {
		const base: RequestParam = typeof params === 'string' ? { url: params } : params;
		const send = (token: string) =>
			request({ ...base, headers: { ...base.headers, Authorization: `Bearer ${token}` } });
		try {
			return await send(await manager.getToken());
		} catch (error: unknown) {
			if (getStatus(error) !== 401) throw error;
			manager.invalidate();
			return send(await manager.getToken(true));
		}
	};
}
