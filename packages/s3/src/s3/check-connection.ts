import type { CheckConnectionResult, Request } from '@hesprs/sync-engine-sdk';
import { getMessage } from '@repo/shared/error';
import type { UrlStyle } from './sigv4';
import { buildUrlWithQuery, parseS3Error } from './url';

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
		const url = buildUrlWithQuery(
			{
				bucket: options.bucket,
				endpoint: options.endpoint,
				key: '/',
				urlStyle: options.urlStyle,
			},
			{ 'list-type': '2', 'max-keys': '0' },
		);
		const response = await request(url, { method: 'GET', throw: false });
		if (response.status >= 200 && response.status < 300) return { success: true } as const;
		return {
			reason: parseS3Error(response.text()) ?? `S3: HTTP ${response.status}`,
			success: false,
		} as const;
	} catch (error) {
		return { reason: getMessage(error), success: false } as const;
	}
}
