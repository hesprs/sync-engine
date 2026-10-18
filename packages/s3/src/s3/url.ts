import { compileQuery, parseUrl } from '@repo/shared/path';
import type { UrlStyle } from './sigv4';

export type UrlOptions = {
	endpoint: string;
	bucket: string;
	key: string;
	urlStyle: UrlStyle;
};

export function buildUrl({ endpoint, bucket, key, urlStyle }: UrlOptions): string {
	const encodedPath = parseUrl(key, true);
	if (urlStyle === 'virtualHosted') {
		const parsed = new URL(endpoint);
		return `${parsed.protocol}//${bucket}.${parsed.host}${encodedPath.startsWith('/') ? encodedPath : `/${encodedPath}`}`;
	}
	return `${endpoint}/${bucket}${encodedPath.startsWith('/') ? encodedPath : `/${encodedPath}`}`;
}

export function buildUrlWithQuery(options: UrlOptions, query: Record<string, string>): string {
	const queryString = compileQuery(query);
	const baseUrl = buildUrl(options);
	return queryString ? `${baseUrl}?${queryString}` : baseUrl;
}

export function getHeader(
	headers: Record<string, string | undefined>,
	name: string,
): string | undefined {
	const entry = Object.entries(headers).find(
		([headerName]) => headerName.toLowerCase() === name.toLowerCase(),
	);
	return entry?.[1];
}
