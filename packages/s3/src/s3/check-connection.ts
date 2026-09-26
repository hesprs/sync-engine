import type { Request } from '@hesprs/sync-engine-sdk';
import { toError } from '@repo/shared/error';
import type { UrlStyle } from './sigv4';
import { buildUrlWithQuery } from './url';
import { parseS3Error } from './utils';

export type S3ConnectionOptions = {
	endpoint: string;
	region: string;
	bucket: string;
	urlStyle: UrlStyle;
};

export async function checkConnection(
	options: S3ConnectionOptions,
	request: Request,
): Promise<void | Error> {
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
		if (response.status >= 200 && response.status < 300) return;
		return new Error(parseS3Error(response.text()) ?? `HTTP ${response.status}`);
	} catch (error) {
		return toError(error);
	}
}
