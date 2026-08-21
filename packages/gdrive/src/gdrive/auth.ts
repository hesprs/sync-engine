import type { Request, RequestParam } from '@hesprs/sync-engine-sdk';
import { OAUTH_DEVICE_CODE_URL, OAUTH_SCOPE, OAUTH_TOKEN_URL } from './api';

/**
 * Minimal HTTP shape used for OAuth endpoints. Kept independent from the SDK
 * `Request` so authentication can run from settings UI code (via Obsidian
 * `requestUrl`) and from tests without a composed request chain.
 */
export type AuthHttp = (params: {
	url: string;
	method: 'GET' | 'POST';
	body?: string;
	contentType?: string;
}) => Promise<{ status: number; json: () => unknown }>;

export type AuthConfig = {
	clientId: string;
	clientSecret: string;
	refreshToken: string;
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
	email?: string;
};

const FORM_CONTENT_TYPE = 'application/x-www-form-urlencoded';

/** Secret storage id under which the Google refresh token is stored. */
export const REFRESH_TOKEN_SECRET_ID = 'sync-engine-gdrive-refresh-token';

function formEncode(fields: Record<string, string>): string {
	return new URLSearchParams(fields).toString();
}

function describeAuthError(data: Record<string, unknown>, status: number): string {
	const description =
		typeof data.error_description === 'string' ? data.error_description : undefined;
	const code = typeof data.error === 'string' ? data.error : undefined;
	return description ?? code ?? `HTTP ${status}`;
}

function safeAuthJson(response: { json: () => unknown }): Record<string, unknown> {
	try {
		const parsed = response.json();
		return typeof parsed === 'object' && parsed !== undefined && parsed !== null
			? (parsed as Record<string, unknown>)
			: {};
	} catch {
		return {};
	}
}

export function decodeIdTokenEmail(idToken: string): string | undefined {
	try {
		const payload = idToken.split('.')[1];
		if (!payload) return undefined;
		const normalized = payload.replaceAll('-', '+').replaceAll('_', '/');
		const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
		const parsed = JSON.parse(atob(padded)) as { email?: unknown };
		return typeof parsed.email === 'string' ? parsed.email : undefined;
	} catch {
		return undefined;
	}
}

export async function startDeviceAuthorization(
	http: AuthHttp,
	clientId: string,
): Promise<DeviceAuthorization> {
	const response = await http({
		body: formEncode({ client_id: clientId, scope: OAUTH_SCOPE }),
		contentType: FORM_CONTENT_TYPE,
		method: 'POST',
		url: OAUTH_DEVICE_CODE_URL,
	});
	const data = safeAuthJson(response);
	if (response.status < 200 || response.status >= 300)
		throw new Error(
			`Google device authorization failed: ${describeAuthError(data, response.status)}`,
		);
	const deviceCode = data.device_code;
	const userCode = data.user_code;
	const verificationUrl = data.verification_url ?? data.verification_uri;
	if (
		typeof deviceCode !== 'string' ||
		typeof userCode !== 'string' ||
		typeof verificationUrl !== 'string'
	)
		throw new Error('Google device authorization returned an unexpected response.');
	return {
		deviceCode,
		expiresIn: typeof data.expires_in === 'number' ? data.expires_in : 1800,
		interval: typeof data.interval === 'number' ? data.interval : 5,
		userCode,
		verificationUrl,
	};
}

export async function pollDeviceToken(
	http: AuthHttp,
	options: {
		clientId: string;
		clientSecret: string;
		authorization: DeviceAuthorization;
		isCancelled?: () => boolean;
		sleep?: (ms: number) => Promise<void>;
		now?: () => number;
	},
): Promise<DeviceTokenResult> {
	const sleep =
		options.sleep ??
		((ms: number) =>
			new Promise<void>((resolve) => {
				setTimeout(resolve, ms);
			}));
	const now = options.now ?? (() => Date.now());
	let interval = Math.max(options.authorization.interval, 1);
	const deadline = now() + options.authorization.expiresIn * 1000;
	while (true) {
		await sleep(interval * 1000);
		if (options.isCancelled?.()) throw new Error('Google Drive connection was cancelled.');
		if (now() > deadline)
			throw new Error('The device code expired, please try connecting again.');
		const response = await http({
			body: formEncode({
				client_id: options.clientId,
				client_secret: options.clientSecret,
				device_code: options.authorization.deviceCode,
				grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
			}),
			contentType: FORM_CONTENT_TYPE,
			method: 'POST',
			url: OAUTH_TOKEN_URL,
		});
		const data = safeAuthJson(response);
		if (
			response.status >= 200 &&
			response.status < 300 &&
			typeof data.access_token === 'string' &&
			typeof data.refresh_token === 'string'
		)
			return {
				accessToken: data.access_token,
				email:
					typeof data.id_token === 'string'
						? decodeIdTokenEmail(data.id_token)
						: undefined,
				expiresIn: typeof data.expires_in === 'number' ? data.expires_in : 3600,
				refreshToken: data.refresh_token,
			};
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

/**
 * Caches the short-lived access token and refreshes it with the stored refresh
 * token when needed. One instance is shared by the request middleware and the
 * connection check so a token refresh happens at most once at a time.
 */
export class TokenManager {
	private accessToken: string | undefined;
	private expiresAt = 0;
	private pending: Promise<string> | undefined;

	constructor(
		private readonly http: AuthHttp,
		private readonly resolveAuth: () => AuthConfig,
		private readonly now: () => number = () => Date.now(),
	) {}

	readonly getToken = (force = false): Promise<string> => {
		if (!force && this.accessToken !== undefined && this.now() < this.expiresAt - 60_000)
			return Promise.resolve(this.accessToken);
		this.pending ??= this.refresh().finally(() => {
			this.pending = undefined;
		});
		return this.pending;
	};

	readonly invalidate = (): void => {
		this.accessToken = undefined;
		this.expiresAt = 0;
	};

	private async refresh(): Promise<string> {
		const { clientId, clientSecret, refreshToken } = this.resolveAuth();
		const response = await this.http({
			body: formEncode({
				client_id: clientId,
				client_secret: clientSecret,
				grant_type: 'refresh_token',
				refresh_token: refreshToken,
			}),
			contentType: FORM_CONTENT_TYPE,
			method: 'POST',
			url: OAUTH_TOKEN_URL,
		});
		const data = safeAuthJson(response);
		if (
			response.status >= 200 &&
			response.status < 300 &&
			typeof data.access_token === 'string'
		) {
			this.accessToken = data.access_token;
			this.expiresAt =
				this.now() + (typeof data.expires_in === 'number' ? data.expires_in : 3600) * 1000;
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
		let response = await send(await manager.getToken());
		if (response.status === 401) {
			manager.invalidate();
			response = await send(await manager.getToken(true));
		}
		return response;
	};
}
