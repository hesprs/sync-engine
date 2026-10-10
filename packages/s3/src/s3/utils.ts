import type { Stat } from '@hesprs/sync-engine-sdk';
import normalizeEtag from '@repo/shared/normalize-etag';
import parseXML from '@repo/shared/parse-xml';

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

export function getFileUid(stat: Stat, key: string) {
	if (stat.isDir) throw new Error(`WebDAV write returned a folder stat for ${key}.`);
	return stat.uid;
}

export function getObjectEtag(value: unknown): string | undefined {
	if (typeof value !== 'string') return;
	const etag = normalizeEtag(value);
	if (etag.trim()) return etag;
}

export function toMetaHeaders(meta: Dict<string>): Record<string, string> {
	const headers: Record<string, string> = {};
	for (const [key, value] of Object.entries(meta))
		if (value !== undefined) headers[`x-amz-meta-${key}`] = value;
	return headers;
}

export function extractMetaHeaders(headers: Record<string, string>): Record<string, string> {
	const meta: Record<string, string> = {};
	for (const [name, value] of Object.entries(headers)) {
		const lower = name.toLowerCase();
		if (lower.startsWith('x-amz-meta-')) meta[lower.slice(11)] = value;
	}
	return meta;
}
