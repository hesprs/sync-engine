import type { Stat } from '@hesprs/sync-engine-sdk';
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
