import type { Binary, Request, RequestParam } from '@hesprs/sync-engine-sdk';
import { textToUint8Array } from '@repo/shared/binary';
import { encodeURIComponent3986 } from '@repo/shared/path';
import { md5 } from 'hash-wasm';

export type UrlStyle = 'virtualHosted' | 'path';

export type SigV4Options = {
	accessKeyId: string;
	secretAccessKey: string;
	sessionToken?: string;
	region: string;
	service: string;
};

type InternalRequest = {
	method: string;
	url: string;
	headers: Record<string, string>;
	body?: Binary | string;
};

const encoder = new TextEncoder();

function toHex(bytes: Binary): string {
	return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(data: Binary): Promise<string> {
	const digest = await crypto.subtle.digest(
		'SHA-256',
		data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
	);
	return toHex(new Uint8Array(digest));
}

async function hmac(key: Binary, message: string): Promise<Binary> {
	const keyData = key.buffer.slice(key.byteOffset, key.byteOffset + key.byteLength);
	const cryptoKey = await crypto.subtle.importKey(
		'raw',
		keyData,
		{ hash: 'SHA-256', name: 'HMAC' },
		false,
		['sign'],
	);
	const sig = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(message));
	return new Uint8Array(sig);
}

function getAmzDate(date: Date): string {
	return date
		.toISOString()
		.replaceAll(':', '')
		.replaceAll('-', '')
		.replaceAll(/\.\d{3}/gv, '');
}

function getDateStamp(date: Date): string {
	return date.toISOString().slice(0, 10).replaceAll('-', '');
}

/**
 * Split URI into canonical URI path and query string.
 * Canonical URI: URI-encoded path, each path segment encoded, slashes preserved.
 * Canonical query string: sorted by key, URI-encoded key=value pairs.
 */
function canonicalizeUrl(url: string): { canonicalUri: string; canonicalQuery: string } {
	const parsed = new URL(url);
	const canonicalUri = parsed.pathname;
	const params = parsed.searchParams;
	const sortedKeys = [...params.keys()].sort();
	const canonicalQuery = sortedKeys
		.map((key) => {
			const values = params.getAll(key);
			values.sort();
			return values
				.map((value) => `${encodeURIComponent3986(key)}=${encodeURIComponent3986(value)}`)
				.join('&');
		})
		.filter(Boolean)
		.join('&');

	return { canonicalQuery, canonicalUri };
}

function buildCanonicalHeaders(headers: Record<string, string>): {
	canonicalHeaders: string;
	signedHeaders: string;
} {
	const normalized: Array<[string, string]> = [];
	for (const [key, value] of Object.entries(headers))
		normalized.push([key.toLowerCase().trim(), value.trim().replaceAll(/\s+/gv, ' ')]);
	normalized.sort(([a], [b]) => a.localeCompare(b));

	const canonicalHeadersStr = normalized.map(([key, value]) => `${key}:${value}\n`).join('');
	const signedHeaders = normalized.map(([key]) => key).join(';');
	return { canonicalHeaders: canonicalHeadersStr, signedHeaders };
}

export async function signRequest(
	params: RequestParam & { method: string; headers: Record<string, string> },
	credentials: SigV4Options,
	date: Date,
): Promise<InternalRequest> {
	const { method, url, headers: rawHeaders, body } = params;
	const host = new URL(url).host;

	const headers: Record<string, string> = { ...rawHeaders };
	headers.host ??= host;
	headers['x-amz-date'] = getAmzDate(date);
	headers['x-amz-content-sha256'] = 'UNSIGNED-PAYLOAD';
	if (credentials.sessionToken) headers['x-amz-security-token'] = credentials.sessionToken;

	const { canonicalUri, canonicalQuery } = canonicalizeUrl(url);
	const { canonicalHeaders: canonicalHeadersStr, signedHeaders } = buildCanonicalHeaders(headers);

	const canonicalRequest = [
		method.toUpperCase(),
		canonicalUri,
		canonicalQuery,
		canonicalHeadersStr,
		signedHeaders,
		'UNSIGNED-PAYLOAD',
	].join('\n');

	const dateStamp = getDateStamp(date);
	const amzDate = getAmzDate(date);
	const credentialScope = `${dateStamp}/${credentials.region}/${credentials.service}/aws4_request`;

	const stringToSign = [
		'AWS4-HMAC-SHA256',
		amzDate,
		credentialScope,
		await sha256Hex(encoder.encode(canonicalRequest)),
	].join('\n');

	const kDate = await hmac(encoder.encode(`AWS4${credentials.secretAccessKey}`), dateStamp);
	const kRegion = await hmac(kDate, credentials.region);
	const kService = await hmac(kRegion, credentials.service);
	const kSigning = await hmac(kService, 'aws4_request');
	const signature = toHex(await hmac(kSigning, stringToSign));

	const credential = `${credentials.accessKeyId}/${credentialScope}`;
	headers.authorization = `AWS4-HMAC-SHA256 Credential=${credential}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

	// Strips host from actually sent headers
	const { host: _, ...restHeaders } = headers;
	return { body, headers: restHeaders, method, url };
}

export function sigv4Middleware(request: Request, credentials: SigV4Options): Request {
	return async (params) => {
		const input =
			typeof params === 'string'
				? { headers: {}, method: 'GET', url: params }
				: { ...params, headers: params.headers ?? {}, method: params.method ?? 'GET' };
		return request(await signRequest(input, credentials, new Date()));
	};
}

export async function md5Base64(data: Binary | string): Promise<string> {
	const bytes = typeof data === 'string' ? textToUint8Array(data) : data;
	const hexDigest = await md5(bytes);
	const raw = (hexDigest.match(/.{2}/gv) as Array<string>).map((h) => Number.parseInt(h, 16));
	return btoa(String.fromCodePoint(...raw));
}
