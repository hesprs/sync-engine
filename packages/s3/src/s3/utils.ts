import parseXML from '@repo/shared/parse-xml';
import type { Stat, StringKV } from '@hesprs/sync-engine-sdk';

// oxlint-disable-next-line typescript/no-unnecessary-type-parameters
export function rootValue<T extends object>(xml: string): T {
	return Object.values(parseXML<Record<string, T>>(xml))[0];
}

type S3ErrorResponse = { Code?: string; Message?: string };
export function parseS3Error(xml: string): string | undefined {
	try {
		const error = rootValue<S3ErrorResponse>(xml);
		if (error?.Code) return formatS3Error(error.Code, error.Message);
	} catch {
		/* Ignore malformed S3 error XML and use the HTTP fallback. */
	}
}
export function formatS3Error(code: string, message?: string): string {
	return `S3 ${code}${message ? `: ${message}` : ''}`;
}

export function getFileUid(stat: Stat, key: string) {
	if (stat.isDir) throw new Error(`WebDAV write returned a folder stat for ${key}.`);
	return stat.uid;
}

export function toMetaHeaders(meta: StringKV): StringKV {
	return Object.fromEntries(
		Object.entries(meta).map(([key, value]) => [`x-amz-meta-${key}`, value]),
	);
}

export function extractMetaHeaders(headers: StringKV): StringKV {
	const meta: StringKV = {};
	for (const [name, value] of Object.entries(headers))
		if (name.startsWith('x-amz-meta-')) meta[name.slice(11)] = value;
	return meta;
}
