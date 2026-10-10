import type { Stat } from '@hesprs/sync-engine-sdk';
import normalizeEtag from '@repo/shared/normalize-etag';
import parseXML from '@repo/shared/parse-xml';
import { encodeUrl } from '@repo/shared/path';

type WebdavError = { error?: { message?: string } };

export function parseWebDAVError(xml: string): string | undefined {
	try {
		return (parseXML<WebdavError>(xml).error?.message ?? xml).trim() || undefined;
	} catch {
		/* Ignore malformed error XML and use the HTTP fallback. */
	}
}

export function getHeader(headers: Record<string, string | undefined>, name: string) {
	const entry = Object.entries(headers).find(
		([headerName]) => headerName.toLowerCase() === name.toLowerCase(),
	);
	return entry?.[1];
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

export function buildUrl(endpoint: string, key: string) {
	const encodedPath = encodeUrl(key);
	if (key === '/') return `${endpoint}/`;
	return `${endpoint}${encodedPath.startsWith('/') ? encodedPath : `/${encodedPath}`}`;
}
