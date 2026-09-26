import type { Binary, Request, RequestParam } from '@hesprs/sync-engine-sdk';
import { textToUint8Array } from '@repo/shared/binary';
import { encodeURIComponent3986 } from '@repo/shared/path';
import { md5 } from 'hash-wasm';
import type { S3DB } from '..';

export type UrlStyle = 'virtualHosted' | 'path';

export type SigV4Options = {
	accessKeyId: string;
	secretAccessKey: string;
	sessionToken?: string;
	region: string;
	service: string;
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
		.replaceAll(/\.\d{3}/gu, '');
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
		normalized.push([key.toLowerCase().trim(), value.trim().replaceAll(/\s+/gu, ' ')]);
	normalized.sort(([a], [b]) => a.localeCompare(b));

	const canonicalHeadersStr = normalized.map(([key, value]) => `${key}:${value}\n`).join('');
	const signedHeaders = normalized.map(([key]) => key).join(';');
	return { canonicalHeaders: canonicalHeadersStr, signedHeaders };
}

export async function signRequest(
	{
		method,
		url,
		headers: rawHeaders,
	}: RequestParam & { method: string; url: string; headers: Record<string, string> },
	{ sessionToken, secretAccessKey, region, service, accessKeyId }: SigV4Options,
	date: Date,
	db: S3DB,
): Promise<Record<string, string>> {
	const host = new URL(url).host;

	const headers: Record<string, string> = { ...rawHeaders };
	headers.host ??= host;
	headers['x-amz-date'] = getAmzDate(date);
	headers['x-amz-content-sha256'] = 'UNSIGNED-PAYLOAD';
	if (sessionToken) headers['x-amz-security-token'] = sessionToken;

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
	const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;

	const stringToSign = [
		'AWS4-HMAC-SHA256',
		amzDate,
		credentialScope,
		await sha256Hex(encoder.encode(canonicalRequest)),
	].join('\n');

	let kSigning: Binary;
	const marker = `${secretAccessKey}~${dateStamp}~${region}~${service}`;
	const cache = db.getMeta('s3Key');
	if (db.getMeta('s3KeyMarker') === marker && cache) kSigning = cache;
	else {
		const kDate = await hmac(encoder.encode(`AWS4${secretAccessKey}`), dateStamp);
		const kRegion = await hmac(kDate, region);
		const kService = await hmac(kRegion, service);
		kSigning = await hmac(kService, 'aws4_request');
		db.setMeta('s3KeyMarker', marker);
		db.setMeta('s3Key', kSigning);
	}
	const signature = toHex(await hmac(kSigning, stringToSign));
	const credential = `${accessKeyId}/${credentialScope}`;
	headers.authorization = `AWS4-HMAC-SHA256 Credential=${credential}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

	// Strips host from actually sent headers to prevent Electron throwing
	delete headers.host;
	// Electron stamps `Sec-Fetch-Mode: no-cors` on every request. Backblaze B2 rejects authenticated POSTs carrying it (multipart upload initiation) as an attempt to bypass CORS from a browser fetch. Overriding with `navigate` keeps Chromium from CORS-enforcing the response (unlike `cors`) and stops the request from looking like a browser fetch, while staying an unsigned header per SigV4.
	headers['Sec-Fetch-Mode'] = 'navigate';
	return headers;
}

export function sigv4Middleware(request: Request, credentials: SigV4Options, db: S3DB): Request {
	return async (url, params = {}) => {
		const input = { ...params, method: params.method ?? 'GET' };
		const headers = await signRequest(
			{ ...input, headers: input.headers ?? {}, url },
			credentials,
			new Date(),
			db,
		);
		return request(url, { ...input, headers });
	};
}

export async function md5Base64(data: Binary | string): Promise<string> {
	const bytes = typeof data === 'string' ? textToUint8Array(data) : data;
	const hexDigest = await md5(bytes);
	const raw = (hexDigest.match(/.{2}/gu) as Array<string>).map((h) => Number.parseInt(h, 16));
	return btoa(String.fromCodePoint(...raw));
}
