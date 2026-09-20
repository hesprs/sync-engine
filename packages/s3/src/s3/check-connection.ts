import type { CheckConnectionResult, Request } from '@hesprs/sync-engine-sdk';
import { getMessage } from '@repo/shared/error';
import type { UrlStyle } from './sigv4';
import { buildUrl } from './url';

export type S3ConnectionOptions = {
	endpoint: string;
	region: string;
	bucket: string;
	urlStyle: UrlStyle;
};

export async function checkConnection(
	options: S3ConnectionOptions,
	request: Request,
): Promise<CheckConnectionResult> {
	try {
		const url = buildUrl({
			bucket: options.bucket,
			endpoint: options.endpoint,
			key: '/',
			urlStyle: options.urlStyle,
		});
		const response = await request(url, { method: 'HEAD', throw: false });
		if (response.status >= 200 && response.status < 300) return { success: true } as const;
		return {
			reason: `HTTP ${response.status}`,
			success: false,
		} as const;
	} catch (error) {
		return { reason: getMessage(error), success: false } as const;
	}
}
