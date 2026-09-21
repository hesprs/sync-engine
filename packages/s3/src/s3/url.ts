import parseXML from '@repo/shared/parse-xml';
import { encodeUrl } from '@repo/shared/path';
import type { UrlStyle } from './sigv4';

export type UrlOptions = {
	endpoint: string;
	bucket: string;
	key: string;
	urlStyle: UrlStyle;
};

type S3ErrorResponse = {
	Error?: {
		Code?: string;
		Message?: string;
	};
};
export function parseS3Error(xml: string): string | undefined {
	try {
		const error = parseXML<S3ErrorResponse>(xml).Error;
		if (error?.Code) return formatS3Error(error.Code, error.Message);
	} catch {
		/* Ignore malformed S3 error XML and use the HTTP fallback. */
	}
}
export function formatS3Error(code: string, message?: string): string {
	return `S3 ${code}: ${message ?? ''}`;
}

export function buildUrl({ endpoint, bucket, key, urlStyle }: UrlOptions): string {
	const encodedPath = encodeUrl(key);
	if (urlStyle === 'virtualHosted') {
		const parsed = new URL(endpoint);
		return `${parsed.protocol}//${bucket}.${parsed.host}${encodedPath.startsWith('/') ? encodedPath : `/${encodedPath}`}`;
	}
	return `${endpoint}/${bucket}${encodedPath.startsWith('/') ? encodedPath : `/${encodedPath}`}`;
}

export function buildUrlWithQuery(options: UrlOptions, query: Record<string, string>): string {
	const baseUrl = buildUrl(options);
	const parsed = new URL(baseUrl);
	for (const [k, v] of Object.entries(query)) parsed.searchParams.set(k, v);
	return parsed.toString();
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
